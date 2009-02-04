////////////////////////////////////////////////////////////
////////// このスクリプトは tombloo 0.3.28 用です //////////
////////////////////////////////////////////////////////////

// 下で request() を書き換えてるので、後方互換性がない可能性がある

models.register(update({
	name : 'Hatena',
	ICON : 'http://www.hatena.ne.jp/favicon.ico',
	
	getPasswords : function(){
		return getPasswords('https://www.hatena.ne.jp');
	},
	
	login : function(user, password){
		var self = this;
		return (this.getAuthCookie()? this.logout() : succeed()).addCallback(function(){
			return request('https://www.hatena.ne.jp/login', {
				sendContent : {
					name : user,
					password : password,
					persistent : 1,
					location : 'http://www.hatena.ne.jp/',
				},
			});
		}).addCallback(function(){
			self.updateSession();
			self.user = user;
		});
	},
	
	logout : function(){
		return request('http://www.hatena.ne.jp/logout');
	},
	
	getAuthCookie : function(){
		return getCookieString('.hatena.ne.jp', 'rk');
	},
	
	getToken : function(){
		switch (this.updateSession()){
		case 'none':
			throw new Error(getMessage('error.notLoggedin'));
			
		case 'same':
			if(this.token)
				return succeed(this.token);
			
		case 'changed':
			var ck = Hatena.getAuthCookie();
			if(!ck)
				throw new Error(getMessage('error.notLoggedin'));
			return succeed(this.token = ck.substr(3).md5bin().replace('==',''));
		}
	},
	
	getCurrentUser : function(){
		switch (this.updateSession()){
		case 'none':
			return succeed('');
			
		case 'same':
			if(this.user)
				return succeed(this.user);
			
		case 'changed':
			var self = this;
			return request('http://www.hatena.ne.jp/my').addCallback(function(res){
				return self.user = $x(
					'(//*[@class="welcome"]/a)[1]/text()', 
					convertToHTMLDocument(res.responseText));
			});
		}
	},
	
	reprTags: function (tags){
		return tags ? joinText(tags.map(function(t){
			return '[' + t + ']';
		}), '', true) : '' ;
	},
}, AbstractSessionService));

models.register({
	name : 'HatenaFotolife',
	ICON : 'http://f.hatena.ne.jp/favicon.ico',
	
	check : function(ps){
		return ps.type=='photo';
	},
	
	post : function(ps){
		// 拡張子を指定しないとアップロードに失敗する(エラーは起きない)
		return (ps.file? succeed(ps.file) : download(ps.itemUrl, getTempFile(createURI(ps.itemUrl).fileExtension))).addCallback(function(file){
			return models.HatenaFotolife.upload({
				fototitle1 : ps.item || ps.page,
				image1     : file,
			});
		});
	},
	
	// image1 - image5
	// fototitle1 - fototitle5 (optional)
	upload : function(ps){
		var user;
		return Hatena.getToken().addCallback(function(token){
			ps.rkm = token;
			
			return Hatena.getCurrentUser();
		}).addCallback(function(user_){
			user = user_;
			return request('http://f.hatena.ne.jp/'+user+'/up', {
				sendContent : update({
					mode : 'enter',
				}, ps),
			});
		}).addCallback(function(res){
			if(!res.channel.URI.asciiSpec.match('/'+user+'/edit'))
				throw new Error(getMessage('error.post','returned URI is '+res.channel.URI.asciiSpec));
		});
	},
});

models.register( {
	name: 'HatenaDiary',
	ICON: 'http://d.hatena.ne.jp/favicon.ico',
	POST_URL : 'http://d.hatena.ne.jp',
	
	check : function(ps){
		return (/(regular|photo|quote|link)/).test(ps.type);
	},
	getTitle : function(ps){
		return Hatena.reprTags(ps.tags) + (ps.item || ps.page || '');
	},
	converters: {
		renderingTemplates: {
			regular: ['*{ps.title}','{ps.description}'],
			photo: ['*{ps.title}',
					'>{ps.pageUrl}:title>',
					'[{ps.itemUrl}:image]',
					'<<',
					'{ps.description}'],
			link: ['*{ps.title}','[{ps.pageUrl}:title]','{ps.description}'],
			quote: ['*{ps.title}',
					'>{ps.itemUrl}:title>',
					'{ps.body}',
					'<<',
					'{ps.description}'],
		},
		__noSuchMethod__: function(name, args){
			var ps = args[0];
			return apply(ps);
		},
		apply: function(ps) {
			ps.title = Hatena.reprTags(ps.tags) + (ps.item || ps.page || '');
			var fmt = expandFormat( this.renderingTemplates[ps.type].join("\n") );
			//alert(fmt + " =====> "+eval(fmt));
			var body = "\n\n"+eval(fmt)+"\n\n";
			return {
				title: ps.item,
				body: body
			};
		}
	},
	getDate : function(){
		var timestamp = toISOTimestamp(new Date()).replace(/[^\d]/g,'');
		return {
			year : timestamp.substr(0,4),
			month : timestamp.substr(4,2),
			day : timestamp.substr(6,2),
			date : timestamp.substr(0,8),
			timestamp: timestamp
		};
	},
	post : function(ps){
		var self = this;
		var date = self.getDate();
		var user;
		var content = {
			title : '',
			body : '',
			dummy : '1',
			mode : 'enter',
			trivial : '0',
			year : date.year,
			month : date.month,
			day : date.day,
			date : '',
			timestamp: date.timestamp
		};
		return models.Hatena.getToken().addCallback(function(token){
			content.rkm = token;
			return models.Hatena.getCurrentUser();
		}).addCallback(function(user_){ // （もしなければ）その日の日記の初回作成を行う
			user = user_;
			var endpoint = [self.POST_URL, user, 'edit'].join('/');
			return request( endpoint, {
				redirectionLimit : 0,
				referrer : endpoint,
				sendContent : content
			});
		}).addCallback(function(res){ // その日の日記の内容を取得
			return request( [self.POST_URL, user, 'edit?date='+date.date].join('/'), {
				redirectionLimit : 0,
				queryString : ''
			});
		}).addCallback(function(res){ // 追記してポスト
			var doc = convertToHTMLDocument(res.responseText);
			var body = doc.getElementById('textarea-edit').textContent;

			if(ps.file) { // TODO: 一日に一つのファイルしかおけない制限がある
				var imageurl = [self.POST_URL,'images/diary',user.substr(0,1),user,[date.year,date.month,date.day].join('-')+'.png'].join('/');
				ps.itemUrl = imageurl;
				body = body.replace(new RegExp(imageurl,'g'),'deleted');
			}
			var entry = self.converters.apply(ps);
			content.date = date.date;
			content.body = body + entry.body;
			content.image = ps.file;
			content.imagetitle = ps.item;
			return request( [self.POST_URL, user, 'edit'].join('/'), {
				redirectionLimit : 0,
				referrer : res.channel.URI.asciiSpec,
				sendContent : content
			});
		}).addCallback(function(res){
			var expect = [self.POST_URL,user,date.date].join('/');
			if (res.channel.URI.asciiSpec!=expect)
				throw new Error(getMessage('error.post', expect + ' failed: '+res.channel.URI.asciiSpec));
		});
	}
});

models.register({
	name : 'HatenaHaiku',
	ICON : 'http://h.hatena.ne.jp/favicon.ico',
	
	check : function(ps){
		return ps.type.match(/(regular|photo|quote|link|conversation|video)/);
	},
	getTokenUsername : function(){
        return request('http://h.hatena.ne.jp/api').addCallback(function(res){
			var doc = convertToHTMLDocument(res.responseText);
			var token = $x('//input[@class="forcopy"]', doc);
			var username = $x('//p[@class="username"]/a', doc);
			if(!token || !username)
                throw new Error(getMessage('error.notLoggedin'));
			return {
                token: token.value,
                username: username.textContent
            }
        });
    },
	post : function(ps){
		return Hatena.getToken().addCallback(function(token){
			if (!ps.description)
				ps.description = '';
			// 先頭タグをはてなハイクキーワードに使う。タグがなければ空文字列（= private キーワード）
			var haikukeyword = '';
			if (ps.tags && ps.tags.length >= 1) {
				haikukeyword = ps.tags.shift();
				ps.tags = Hatena.reprTags(ps.tags);
			} else {
				ps.tags = '';
			}

			var body;
			if (ps.type == 'regular') {
				body = joinText([
					ps.item,
					ps.tags,
					ps.description
				], "\n", true);
			} else if(ps.type == 'quote' || ps.type == 'link' || ps.type == 'regular') {
				body = joinText([
					ps.itemUrl? '['+ps.itemUrl+':title='+ps.item+']': ps.item,
					ps.body? ">>\n"+ps.body+"\n<<": '',
					' ',
					ps.tags,
					ps.description
				], "\n", true);
			} else if (ps.type == 'photo') {
				if (!ps.file) {
					body = joinText([
						ps.itemUrl,
						ps.pageUrl? '['+ps.pageUrl+':title='+ps.page+']': ps.item,
						' ',
						ps.tags,
						ps.description
					], "\n", true);
				} else {
					body = joinText([
						ps.tags,
						ps.description,
						' ',
						ps.pageUrl? '['+ps.pageUrl+':title='+ps.page+']': ps.item
					], "\n", true);

				}
			} else {
				body = joinText([ps.itemUrl, ps.item, ' ', ps.body, ps.description], "\n", true);
			}
			if(ps.type == 'photo' && ps.file) { // ファイルは /entry では送れないので、/api を使う
				models.HatenaHaiku.getTokenUsername().addCallback(function(tk){
					return request('http://h.hatena.ne.jp/api/statuses/update.json', {
	                    redirectionLimit : 0,
	                    authorization: 'Basic '+window.btoa(tk.username+':'+tk.token),
	                    sendContent : {
	                        status  : body,
							keyword : haikukeyword==''? 'id:'+tk.username: haikukeyword,
	                        file    : ps.file,
	                        source  : 'tombloo',
							token   : tk.token,
							username : tk.username
						}
					});
				});
			} else {
				return request('http://h.hatena.ne.jp/entry', {
					redirectionLimit : 0,
					sendContent : {
						body   : body,
						word   : haikukeyword,
						source : 'tombloo',
						rkm    : token
					}
				});
			}
		});
	},
});

Tombloo.Service.extractors.register([
	{
		name: 'HatenaHaiku',
		getEntry : function(ctx){
			return $x('./ancestor::div[contains(@class,"entry")]', ctx.target);
		},
		getItem : function(ctx, ent){
			var entry = ent || this.getEntry(ctx);
			var author = $x('.//span[contains(@class,"username")]/a', entry);
			var username = author.textContent.trim();
			return {
				itemUrl   : 'http://' + ctx.host + $x('.//span[contains(@class,"timestamp")]/a/@href', entry),
				item      : $x('.//h2[contains(@class,"title")]/a/text()', entry) + ' - ' + username,
				author    : username,
				authorUrl : author.href
			};
		}
	},

	{
		name : 'Photo - HatenaHaiku',
		ICON : 'http://h.hatena.com/favicon.ico',
		check : function(ctx){
			return ctx.onImage && ctx.href.match(/\/\/h\.hatena\.(ne\.jp|com)/) && Tombloo.Service.extractors.HatenaHaiku.getEntry(ctx);
		},
		extract : function(ctx){
			return update({
				type : 'link',
			}, Tombloo.Service.extractors.HatenaHaiku.getItem(ctx));
		},
	},

	{
		name : 'Quote - HatenaHaiku',
		ICON : 'http://h.hatena.com/favicon.ico',
		check : function(ctx){
			return ctx.href.match(/\/\/h\.hatena\.(ne\.jp|com)/) && Tombloo.Service.extractors.HatenaHaiku.getEntry(ctx);
		},
		extract : function(ctx){
			var entry = Tombloo.Service.extractors.HatenaHaiku.getEntry(ctx);
			return (ctx.selection?
				succeed(ctx.selection) :
				request(ctx.href).addCallback(function(res){
					var doc = convertToHTMLDocument(res.responseText);
					return $x('.//div[contains(@class,"body") and not(contains(@class,"list-body"))]',entry).innerHTML.replace(/<br>/gi, "\n").trimTag();
				})
			).addCallback(function(body){
				return update({
					type    : 'quote',
					body    : body.trim(),
				}, Tombloo.Service.extractors.HatenaHaiku.getItem(ctx, entry));
			});
		},
	},
	
	{
		name : 'Link - HatenaHaiku',
		ICON : 'http://h.hatena.com/favicon.ico',
		check : function(ctx){
			return ctx.href.match(/\/\/h\.hatena\.(ne\.jp|com)/) && Tombloo.Service.extractors.HatenaHaiku.getEntry(ctx);
		},
		extract : function(ctx){
			var ps = Tombloo.Service.extractors.HatenaHaiku.getItem(ctx);
			ps.type = 'link';
			ctx.title = ps.item;
			ctx.href = ps.itemUrl;
			return ps;
		},
	},
], 'LDR');

models.copyTo(this);



this.expandFormat = function(format){
	return "\'" + format.replace(/([\'\"])/g, function(s){return '\\'+s;}).replace(/{/g,"\'+(").replace(/}/g,")+\'").replace(/\n/mg,'\'+\"\\n\"+\'') + "\'";
};

String.prototype.md5bin = function(charset){
	var crypto = new CryptoHash(CryptoHash.MD5);
	var data = this.toByteArray(charset || "UTF-8");
	crypto.update(data, data.length);
	return crypto.finish(true);
};

this.request = function (url, opts){
	var d = new Deferred();
	
	opts = opts || {};
	
	var uri = createURI(url + queryString(opts.queryString, true));
	var channel = broad(IOService.newChannelFromURI(uri));
	
	if(opts.referrer)
		channel.referrer = createURI(opts.referrer);

	if(opts.authorization)
		channel.setRequestHeader('Authorization', opts.authorization, true);

	setCookie(channel);
	
	if(opts.sendContent){
		var contents = opts.sendContent;
		
		// マルチパートチェック/パラメーター準備
		var multipart;
		for(var name in contents){
			// 値として直接ファイルが設定されているか?
			var value = contents[name];
			if(value instanceof IInputStream || value instanceof IFile)
				value = contents[name] = {file : value};
			
			if(value && value.file)
				multipart = true;
		}
		
		if(!multipart){
			contents = queryString(contents);
			channel.setUploadStream(
				new StringInputStream(contents), 
				'application/x-www-form-urlencoded', -1);
		} else {
			var boundary = '---------------------------' + (new Date().getTime());
			var streams = [];
			
			for(var name in contents){
				var value = contents[name];
				if(value==null)
					continue;
				
				if(!value.file){
					streams.push([
						'--' + boundary,
						'Content-Disposition: form-data; name="' + name + '"',
						'',
						(value.convertFromUnicode? value.convertFromUnicode() : value),
					]);
				} else {
					if(value.file instanceof IFile){
						value.fileName = value.file.leafName;
						value.file = IOService.newChannelFromURI(createURI(value.file)).open();
					}
					
					streams.push([
						'--' + boundary,
						'Content-Disposition: form-data; name="' + name + '"; filename="' + (value.fileName || '_') + '"',
						'Content-Type: ' + (value.contentType || 'application/octet-stream'),
						'',
					])
					streams.push(new BufferedInputStream(value.file));
					streams.push('');
				}
			}
			streams.push('--' + boundary + '--');
			
			var mimeStream = new MIMEInputStream(new MultiplexInputStream(streams));
			mimeStream.addHeader('Content-Type', 'multipart/form-data; boundary=' + boundary);
			channel.setUploadStream(mimeStream, null, -1);
		}
	}
	
	var redirectionCount = 0;
	var listener = {
		QueryInterface : createQueryInterface([
			'nsIStreamListener', 
			'nsIProgressEventSink', 
			'nsIHttpEventSink', 
			'nsIInterfaceRequestor', 
			'nsIChannelEventSink']),
		
		isAppOfType : function(val){
			// http://hg.mozilla.org/mozilla-central/file/FIREFOX_3_1b2_RELEASE/docshell/base/nsILoadContext.idl#l78
			//
			// 本リスナが特定のアプリケーション目的で使用され、その
			// アプリケーション種別に対して動作可能かを返す。
			// val にはアプリケーション種別を示す nsIDocShell の
			// APP_TYPE_XXX が渡される。
			//
			//   APP_TYPE_UNKNOWN 0
			//   APP_TYPE_MAIL    1
			//   APP_TYPE_EDITOR  2
			return (val == 0);
		},
		
		// nsIProgressEventSink
		onProgress : function(req, ctx, progress, progressMax){},
		onStatus : function(req, ctx, status, statusArg){},
		
		// nsIInterfaceRequestor
		getInterface : function(iid){
			// Firefox 2でnsIPromptを要求されエラーになるため判定処理を外す
			// インターフェースにないメソッドを呼ばれる可能性があるが確認範囲で発生しなかった
			// http://developer.mozilla.org/ja/docs/Creating_Sandboxed_HTTP_Connections
			return this;
		},
		
		// nsIHttpEventSink
		onRedirect : function(oldChannel, newChannel){},
		
		// nsIChannelEventSink
		onChannelRedirect : function(oldChannel, newChannel, flags){
			// channel.redirectionLimitを使うとリダイレクト後のアドレスが取得できない
			redirectionCount++;
			
			if(opts.redirectionLimit!=null && redirectionCount>opts.redirectionLimit){
				// NS_ERROR_REDIRECT_LOOP
				newChannel.cancel(2152398879);
				
				var res = {
					channel : newChannel,
					responseText : '',
					status : oldChannel.responseStatus,
					statusText : oldChannel.responseStatusText,
				};
				d.callback(res);
				
				return;
			}
			
			setCookie(newChannel);
		},
		
		// nsIStreamListener
		onStartRequest: function(req, ctx){
			this.data = [];
		},
		onDataAvailable: function(req, ctx, stream, sourceOffset, length){
			this.data.push(new InputStream(stream).read(length));
		},
		onStopRequest: function (req, ctx, status){
			// Firefox 3ではcancelするとonStopRequestは呼ばれない
			if(opts.redirectionLimit!=null && redirectionCount>opts.redirectionLimit)
				return;
			
			broad(req);
			
			var text = this.data.join('');
			var charset = opts.charset || req.contentCharset;
			
			try{
				text = charset? text.convertToUnicode(charset) : text;
			} catch(err){
				// [FIXME] 調査中
				error(err);
				error(charset);
				error(text);
			}
			var res = {
				channel : req,
				responseText : text,
				status : req.responseStatus,
				statusText : req.responseStatusText,
			};
			
			if(Components.isSuccessCode(status) && res.status < 400){
				d.callback(res);
			}else{
				res.message = getMessage('error.http.' + res.status);
				d.errback(res);
			}
		},
	};
	
	channel.requestMethod = 
		(opts.method)? opts.method : 
		(opts.sendContent)? 'POST' : 'GET';
	channel.notificationCallbacks = listener;
	channel.asyncOpen(listener, null);
	
	// 確実にガベージコレクトされるように解放する
	listener = null;
	channel = null;
	
	return d;
};

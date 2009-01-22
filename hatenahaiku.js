Components.classes['@brasil.to/tombloo-service;1'].getService().wrappedJSObject['request'] = function (url, opts){
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

addBefore(Tombloo.Service, 'post', function(ps) {
	if (ps.type == 'quote' && (!ps.favorite || ps.favorite.name != 'Tumblr'))
		ps.body = '"' + ps.body + '"';
});

Tombloo.Service.extractors.register(
	{
		name: 'HatenaHaiku',
		getEntry : function(ctx){
			return $x('./ancestor::div[contains(@class,"entry")]', ctx.target);
		},
		getItem : function(ctx, ent){
			var entry = ent || this.getEntry(ctx);
			var author = $x('.//span[contains(@class,"username")]/a', entry);
			return {
				itemUrl   : 'http://' + ctx.host + $x('.//span[contains(@class,"timestamp")]/a/@href', entry),
				item      : $x('.//h2[contains(@class,"title")]/a/text()', entry),
				author    : author.textContent.trim(),
				authorUrl : author.href
			};
		},
	}
);

Tombloo.Service.extractors.register(
	{
		name : 'Photo - Hatena Haiku',
		ICON : 'http://h.hatena.com/favicon.ico',
		check : function(ctx){
			return ctx.onImage && ctx.href.match(/\/\/h\.hatena\.(ne\.jp|com)/) && Tombloo.Service.extractors.HatenaHaiku.getEntry(ctx);
		},
		extract : function(ctx){
			var ps = Tombloo.Service.extractors.HatenaHaiku.getItem(ctx);
			ps.type = 'photo';
			ps.author = 'id:' + ps.author;
			ctx.title = ps.item;
			ctx.href = ps.itemUrl;
			return update(ps, Tombloo.Service.extractors.Photo.extract(ctx));
		},
	}
);
Tombloo.Service.extractors.register(

	{
		name : 'Quote - Hatena Haiku',
		ICON : 'http://h.hatena.com/favicon.ico',
		check : function(ctx){
			return ctx.href.match(/\/\/h\.hatena\.(ne\.jp|com)/) &&
				$x('./ancestor::div[contains(@class,"entry")]', ctx.target);
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
				var ps = Tombloo.Service.extractors.HatenaHaiku.getItem(ctx, entry);
				ctx.href = ps.itemUrl;
				return {
					type    : 'quote',
					body    : body.trim(),
					item    : ps.item + ' - ' + ps.author,
					itemUrl : ps.itemUrl
				};
			});
		},
	}
);

models.register({
	name : 'HatenaHaiku',
	ICON : 'http://h.hatena.ne.jp/favicon.ico',
	
	check : function(ps){
		return ps.type.match(/(regular|photo|quote|link|conversation|video)/);
	},
	getToken : function(){
		return request('http://h.hatena.ne.jp/api').addCallback(function(res){
			var doc = convertToHTMLDocument(res.responseText);
			var token = $x('//input[@class="forcopy"]', doc);
			var username = $x('//p[@class="username"]/a', doc);
			if(!token || !username)
				throw new Error(getMessage('error.notLoggedin'));
			return {
				token: token.value,
				username: username.textContent
			};
		});
	},
	post : function(ps){
		return this.getToken().addCallback(function(token){
			if (!ps.description)
				ps.description = '';

			// コマンド文字列のエスケープ
			ps.item = ps.item.replace(/=/g,'&#61').replace(/@/g,'&#64');

			// 先頭タグをはてなハイクキーワードに使う。タグがなければ個人用キーワード。
			var haikukeyword = 'id:' + token.username;
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
					ps.item,
					ps.itemUrl,
					ps.body? ">>\n"+ps.body+"\n<<": '',
					' ',
					ps.tags,
					ps.description
				], "\n", true);
			} else if (ps.type == 'photo') {
				body = joinText([
					ps.itemUrl,
					ps.pageUrl? '['+ps.pageUrl+':title='+ps.page+']': ps.item,
					' ',
					ps.tags,
					ps.body,
					ps.description], "\n", true);
			} else {
				body = joinText([ps.itemUrl, ps.item, ' ', ps.body, ps.description], "\n", true);
			}
			return request('http://h.hatena.ne.jp/api/statuses/update.xml', {
				redirectionLimit : 0,
				authorization: 'Basic '+window.btoa(token.username+':'+token.token),
				sendContent : update({
					status  : body,
					keyword : haikukeyword,
					file    : ps.file,
					source  : 'tombloo'
				},token),
			});
		});
	},
});

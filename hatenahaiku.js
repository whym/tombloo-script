////////////////////////////////////////////////////////////
////////// このスクリプトは Tombloo 0.4.14 用です //////////
////////////////////////////////////////////////////////////

// 機能：
// 1. はてなハイクへの投稿（Tombloo の設定のポスト先として選択可能。適宜、はてなフォトライフへのアップロードを同時に行う）
// 2. はてなハイクからの引用、画像リブログ（はてなハイク上での右クリックメニューで選択可能）
// 3. おまけとして、はてなフォトライフ、はてなダイアリーへの投稿（Tombloo 0.4.9 組み込みの機能とほとんど同じ）

// url: http://github.com/whym/tombloo-script/raw/master/hatenahaiku.js

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
		models.Hatena.getCurrentUser().addCallback(function(user){
			models.Hatena.getUserInfo().addCallback(itemgetter('rkm')).addCallback(function(token){
				content.rkm = token;
																				   });
			// （もしなければ）その日の日記の初回作成を行う
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
	getSuggestions : function(url){
		return models.HatenaHaiku.getTokenUsername().addCallback(function(tk){
			return request('http://h.hatena.ne.jp/' + tk.username + '/following');
		}).addCallback(function(res){
			var doc = convertToHTMLDocument(res.responseText);
			return {
				duplicated : false,
				tags : $x('//ul[@class="list-keyword"]/li/a/text()', doc, true).map(function(tag){
					return {
						name      : tag,
						frequency : -1,
					};
				}),
			};
		});
	},
	post : function(ps){
		var userInfo;
		return models.Hatena.getCurrentUser().addCallback(function(user){
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
						headers: {
							authorization: 'Basic '+window.btoa(tk.username+':'+tk.token)
						},
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
				models.Hatena.getUserInfo().addCallback(itemgetter('rkm')).addCallback(function(token){
					return request('http://h.hatena.ne.jp/entry', {
						redirectionLimit : 0,
						sendContent : {
							body   : body,
							word   : haikukeyword,
							source : 'tombloo',
							rkm    : token
						}
					});
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
		getItem : function(ctx, getOnly){
			var entry = this.getEntry(ctx);
			var author = $x('.//span[contains(@class,"username")]/a', entry);
			var username = author.textContent.trim();
			var res = {
				item     : $x('.//h2[contains(@class,"title")]/a/text()', entry) + ' - ' + username,
				itemUrl  : 'http://' + ctx.host + $x('.//span[contains(@class,"timestamp")]/a/@href', entry),
				author   : username,
				authorUrl: author.href,
			};
			if(!getOnly){
				ctx.href  = res.itemUrl;
				ctx.title = res.item;
			}
			return res;
		}
	},

	{
		name : 'Photo - HatenaHaiku',
		ICON : 'http://h.hatena.com/favicon.ico',
		check : function(ctx){
			return ctx.onImage && ctx.href.match(/\/\/h\.hatena\.(ne\.jp|com)/) && Tombloo.Service.extractors.HatenaHaiku.getEntry(ctx);
		},
		extract : function(ctx){
			return update(Tombloo.Service.extractors.HatenaHaiku.getItem(ctx), {
				type    : 'photo',
				itemUrl : ctx.target.src
			});
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
				}, Tombloo.Service.extractors.HatenaHaiku.getItem(ctx));
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

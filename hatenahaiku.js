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
			if (ps.tags) {
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

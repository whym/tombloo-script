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
			}
		});
	},
	post : function(ps){
		return this.getToken().addCallback(function(token){
			var body;
			var tags = joinText(ps.tags, '][', false);
			if (tags)
				tags = '['+tags+'] ';
			ps.item = ps.item.replace(/=/g,'&#61').replace(/@/g,'&#64');
			if(ps.type == 'quote' || ps.type == 'link' || ps.type == 'regular') {
				body = joinText([
					ps.itemUrl? ('[' + ps.itemUrl + ':title='+ ps.item + "]"): ps.item,
					ps.body? ">>\n"+ps.body+"\n<<": '',
					tags + ps.description
				], "\n", true);
			} else {
				body = joinText([ps.itemUrl, ps.item, ' ', ps.body, ps.description], "\n", true)
			}
			return request('http://h.hatena.ne.jp/api/statuses/update.xml', {
				redirectionLimit : 0,
				authorization: 'Basic '+window.btoa(token.username+':'+token.token),
				sendContent : update({
					status  : body,
					keyword : 'id:' + token.username,
					file    : ps.file,
					source  : 'tombloo'
				},token),
			});
		});
	},
});

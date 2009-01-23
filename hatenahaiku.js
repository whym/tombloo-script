function md5_base64(str){
	var converter = Components.classes["@mozilla.org/intl/scriptableunicodeconverter"]
        .createInstance(Components.interfaces.nsIScriptableUnicodeConverter);
	// ここでは UTF-8 を使います。他のエンコーディングも選ぶこともできます。
	converter.charset = "UTF-8";
	// result は出力用パラメータです。
	// result.value は配列の長さを保持します。
	var result = {};
	// data はバイトの配列です。
	var data = converter.convertToByteArray(str, result);
	var ch = Components.classes["@mozilla.org/security/hash;1"]
        .createInstance(Components.interfaces.nsICryptoHash);
	ch.init(ch.MD5);
	ch.update(data, data.length);
	var s = ch.finish(true);
	return s.substr(0, s.length - 2);
}

models.register({
	name : 'HatenaHaiku',
	ICON : 'http://h.hatena.ne.jp/favicon.ico',
	
	check : function(ps){
		return ps.type.match(/(regular|photo|quote|link|conversation|video)/);
	},
	getToken: function() {		// TODO: Hatena. におく。
	},
	post : function(ps){
		return function(){
			var ck = Hatena.getAuthCookie();
			if(!ck)
			throw new Error(getMessage('error.notLoggedin'));
			var token = md5_base64(ck.substr(3));

			if (!ps.description)
				ps.description = '';

			// 先頭タグをはてなハイクキーワードに使う。タグがなければ個人用キーワード。
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
			return request('http://h.hatena.ne.jp/entry', {
				redirectionLimit : 0,
				sendContent : {
					body   : body,
					word   : haikukeyword,
					//file   : ps.file, // TODO: file 投稿は apiじゃないとできない。あとで。
					source : 'tombloo',
					rkm    : token
				}
			});
		}();
	},
});

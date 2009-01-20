
models.register({
    name : 'LibraryThing',
	ICON : 'http://www.librarything.com/favicon.ico',
	check : function(ps){
		return ps.type == 'link' && !ps.file;
	},

	getAuthCookie : function(){
		return getCookieString('librarything.com', 'LTAnonSessionID');
	},

	post : function(ps){
		if (!this.getAuthCookie())
			throw new Error(getMessage('error.notLoggedin'));
		return request('http://www.librarything.com/import_submit.php', {
			sendContent : {
				form_textbox : ps.itemUrl
			}
		}).addCallback(function(res){
			var error = res.channel.URI.asciiSpec.extract('http://www.librarything.com/import.php?pastealert=(.*)');
			if (error)
				throw new Error(error);
			var doc = convertToHTMLDocument(res.responseText);
			return request('http://www.librarything.com/import_questions_submit.php', {
				redirectionLimit : 0,
				sendContent : update(formContents(doc), {
					masstags :	joinText(ps.tags, ",")
				})
			});
		});
	}
});

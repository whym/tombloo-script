models.Hatena.getToken = function(){
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
};

String.prototype.md5bin = function(charset){
	var crypto = new CryptoHash(CryptoHash.MD5);
	var data = this.toByteArray(charset || "UTF-8");
	crypto.update(data, data.length);
	return crypto.finish(true);
};

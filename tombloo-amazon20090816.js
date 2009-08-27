addAround(Tombloo.Service.extractors.Amazon, 'extract', function(proceed, args){
	var ctx = args[0];
	var self = Tombloo.Service.extractors.Amazon;

	var asin = self.getAsin(ctx);
	return succeed().addCallback(function(){
		var creators = $x('//title/text()');
		creators = creators.substr(0, creators.lastIndexOf(':'));
		creators = creators.substr(creators.lastIndexOf(':') + 1).trim();
		return {
			title: $x('id("prodImage")/@alt'),
			creators: creators.length>0? [creators] : [],
			largestImage: $x('id("prodImage")/@src'), //FIXME: 最大じゃないかもしれない
			releaseDate: new Date()
		};
	}).addCallback(function(item){
		ctx.href  = Amazon.normalizeUrl(asin);
		ctx.title = item.title + (item.creators.length? ' / ' + item.creators.join(', ') : '');
				
		return item;
	});
});

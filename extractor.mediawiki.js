Tombloo.Service.extractors.register( [
	{
		name : 'MediaWiki',
		getItem : function(ctx, getOnly, mostrecent){
			if (!hasElementClass(ctx.document.body, 'mediawiki'))
				return;
			var path = $x((mostrecent? 'id("printfooter")/a/@href': 'id("t-permalink")/a/@href'),
						  ctx.document);
			var anchor = ctx.href.split('#').pop();
			anchor = anchor? '#'+anchor: '';
			var res = {
				href: path? 'http://'+ ctx.host + path + anchor: ctx.href
			};
			if(!getOnly){
				ctx.href  = res.href;
			}
			return res;
		},
	},

	{
		name : 'Photo - MediaWiki Thumbnail',
		ICON : 'http://www.mediawiki.org/favicon.ico',
		check : function(ctx){
			return ctx.onLink && 
				Tombloo.Service.extractors.MediaWiki.getItem(ctx,true) &&
				/wiki\/.+:/.test(ctx.link.href) && 
				(/\.(svg|png|gif|jpe?g)$/i).test(ctx.link.href);
		},
		extract : function(ctx){
			return request(ctx.link.href).addCallback(function(res){
				// SVGの場合サムネイルを取得する
				var xpath = (/\.svg$/i).test(ctx.link.href)?
					'id("file")/a/img/@src':
					'id("file")/a/@href';
				Tombloo.Service.extractors.MediaWiki.getItem(ctx);
				var doc = convertToHTMLDocument(res.responseText);
				return {
					type	  : 'photo',
					item	  : ctx.title,
					itemUrl   : $x(xpath, doc),
					author    : $x('//h1/text()',doc),
					authorUrl : res.channel.URI.asciiSpec
 				};
			});
		}
	},
	
	{
		name : 'Quote - MediaWiki',
		ICON : 'http://www.mediawiki.org/favicon.ico',
		check : function(ctx){
			return Tombloo.Service.extractors.MediaWiki.getItem(ctx,true) &&
				ctx.selection;
		},
		extract : function(ctx){
			with(Tombloo.Service.extractors){
				MediaWiki.getItem(ctx);
				return Quote.extract(ctx);
			}
		}
	},

	{
		name : 'Link - MediaWiki',
		ICON : 'http://www.mediawiki.org/favicon.ico',
		check : function(ctx){
			return Tombloo.Service.extractors.MediaWiki.getItem(ctx,true);
		},
		extract : function(ctx){
			with(Tombloo.Service.extractors){
				MediaWiki.getItem(ctx,false,true);
				return Link.extract(ctx);
			}
		}
	},
	
	{
		name : 'Link - permalink - MediaWiki',
		ICON : 'http://www.mediawiki.org/favicon.ico',
		check : function(ctx){
			return Tombloo.Service.extractors.MediaWiki.getItem(ctx,true);
		},
		extract : function(ctx){
			with(Tombloo.Service.extractors){
				MediaWiki.getItem(ctx);
				return Link.extract(ctx);
			}
		}
	},
	
	{
		name : 'Photo - Capture MediaWiki',
		ICON : 'http://www.mediawiki.org/favicon.ico',
		check : function(ctx){
			return Tombloo.Service.extractors.MediaWiki.getItem(ctx,true);
		},
		extract : function(ctx){
			with(Tombloo.Service){
				extractors.MediaWiki.getItem(ctx);
				return extractors['Photo - Capture'].extract(ctx);
			}
		}
	},
	
] );

/*global MAPJS, $, _, Image*/
MAPJS.MapImageBuilder = function () {
	'use strict';
	var self = this,
		toBox = function (node) {
			return {
				left: node.x,
				top: node.y,
				width: node.width,
				height: node.height,
				level: node.level
			};
		},
		FakeJQ = function (tag, namespace) {
			var self = this,
				children = [],
				attributes = {},
				css = {},
				text,
				appendPx = ['top', 'left', 'width', 'height', 'stroke-width'];
			self.FAKE = true;
			self.text = function (newText) {
				text = newText;
				return self;
			};
			self.append = function (childFakeJQ) {
				if (!childFakeJQ.FAKE) {
					throw 'trying to add something stupid';
				}
				children.push(childFakeJQ);
				return self;
			};
			self.appendTo = function (parentFakeJQ) {
				parentFakeJQ.append(self);
				return self;
			};
			self.attr = function (newAttribs, value) {
				if (value) {
					attributes[newAttribs] = value;
				} else {
					attributes = _.extend (attributes, newAttribs);
				}
				return self;
			};
			self.css = function (newCss, value) {
				if (value) {
					css[newCss] = value;
				} else {
					css = _.extend (css, newCss);
				}
				return self;
			};
			self.serialize = function (buffer, parentNamespace) {
				var toString = false;
				if (!buffer) {
					buffer = [];
					toString = true;
				}
				buffer.push('<');
				buffer.push(tag);
				if (parentNamespace !== namespace) {
					buffer.push(' xmlns="');
					buffer.push(namespace);
					buffer.push('"');
				}

				_.each(attributes, function (v, k) {
					buffer.push(' ');
					buffer.push(k);
					buffer.push('="');
					buffer.push(String(v).replace(/"/g, '\''));
					buffer.push('"');
				});
				if (!_.isEmpty(css)) {
					buffer.push(' style="');
					_.each(css, function (v, k) {
						buffer.push(k);
						buffer.push(':');
						buffer.push(String(v).replace(/"/g, '\''));
						if (_.contains(appendPx, k)) {
							buffer.push('px');
						}
						buffer.push(';');
					});
					buffer.push('"');
				}
				if (text || !_.isEmpty(children)) {
					buffer.push('>');
					if (text) {
						buffer.push(_.escape(text));
					}
					_.each(children, function (childJq) {
						childJq.serialize(buffer, namespace);
					});
					buffer.push('</');
					buffer.push(tag);
					buffer.push('>');
				} else {
					buffer.push('/>');
				}

				if (toString) {
					return buffer.join('');
				}
			};
		};

	self.generateSVG = function (theme, idea, textSizer, options) {
		var deferred = $.Deferred(),
			createSVG = function (tag) {
				return new FakeJQ(tag, 'http://www.w3.org/2000/svg');
			},
			createDOM = function (tag) {
				return new FakeJQ(tag, 'http://www.w3.org/1999/xhtml');
			},
			themeProcessor = new MAPJS.ThemeProcessor(),
			themeDimensionProvider = new MAPJS.ThemeDimensionProvider(textSizer),
			layout = MAPJS.calculateLayout(idea, themeDimensionProvider.dimensionProviderForTheme(theme), {theme: theme}),
			initLayoutModel = function () {
				var result = new MAPJS.LayoutModel();
				result.setLayout(layout);
				return result;
			},
			layoutModel = initLayoutModel(),
			bounds = layoutModel.layoutBounds(),
			calcBounds = function () {
				var centerNode = layoutModel.getNode(idea.id),
					imgCenter = {
						x: centerNode.x + (centerNode.width / 2),
						y: centerNode.y + (centerNode.height / 2)
					};

				if (options && options.clipRect) {
					return {
						x: (options.clipRect.width / 2) - imgCenter.x,
						y: (options.clipRect.height / 2) - imgCenter.y,
						width: options.clipRect.width,
						height: options.clipRect.height
					};

				} else {
					return {
						x: -1 *  bounds.minX,
						y: -1 *  bounds.minY,
						width: bounds.width,
						height: bounds.height
					};
				}

			},
			clipRect = calcBounds(),
			nodeLayoutProvider = themeDimensionProvider.nodeLayoutProviderForTheme(theme),
			svg =  createSVG('svg').attr({'width': clipRect.width, 'height': clipRect.height}),
			g = createSVG('g').attr('transform', 'translate(' + clipRect.x + ',' + clipRect.y + ')').css({fill: 'none'}).appendTo(svg),
			writeConnector = function (fromNode, toNode) {
				var path = MAPJS.Connectors.themePath(toBox(fromNode), toBox(toNode), theme),
					g = createSVG('g').attr('transform', 'translate(' + path.position.left + ',' + path.position.top + ')');

				createSVG('path').attr({'d': path.d, stroke: path.color}).appendTo(g);
				return g;
			},
			writeLink = function (link) {
				var path = MAPJS.Connectors.linkPath(toBox(layoutModel.getNode(link.ideaIdFrom)), toBox(layoutModel.getNode(link.ideaIdTo)), link.attr.style.arrow),
					g = createSVG('g').attr('transform', 'translate(' + path.position.left + ',' + path.position.top + ')'),
					dashes = {
						dashed: '8, 8',
						solid: ''
					},
					linkAttr = link.attr && link.attr.style;

				createSVG('path').appendTo(g).attr({
					'd': path.d,
					'stroke-dasharray': dashes[linkAttr.lineStyle]
				}).css('stroke', linkAttr.color);
				if (path.arrow) {
					createSVG('path').appendTo(g).attr({d: path.arrow, fill: linkAttr.color});
				}
				return g;
			},
			writeNode = function (node) {
				var nodeTheme = theme.nodeTheme(['level_' + node.level, 'default']),
					align = 'center',
					title = MAPJS.formattedNodeTitle(node.title),
					layout = nodeLayoutProvider(node),
					backgroundColor = (node.attr && node.attr.style && node.attr.style.background) || nodeTheme.backgroundColor,
					fontColor,
					g = createSVG('g').attr({
						'transform': 'translate(' + node.x + ',' + node.y + ')'
					}),
					rect = createSVG('rect').attr({
						x: 0,
						y:  0,
						width: node.width,
						height: node.height,
						rx: nodeTheme.cornerRadius,
						ry: nodeTheme.cornerRadius
					}).appendTo(g),
					foreignObject = createSVG('foreignObject').appendTo(g);



				if (backgroundColor && backgroundColor === 'transparent') {
					backgroundColor = nodeTheme.backgroundColor;
				}


				if (nodeTheme.borderType === 'surround') {
					rect.css({fill: backgroundColor});
					if (nodeTheme.lineColor !== 'transparent') {
						rect.css({stroke: nodeTheme.lineColor, 'stroke-width': 1});
					}
					fontColor = nodeTheme.text[MAPJS.foregroundStyle(backgroundColor)];
				} else {
					fontColor = backgroundColor || nodeTheme.text.color;
				}
				if (layout.image) {
					createDOM('img').attr({'src': node.attr.icon.url}).css({
						left: layout.image.x,
						top: layout.image.y,
						width: layout.image.width,
						height: layout.image.height,
						position: 'fixed'
					}).appendTo(foreignObject);
				}

				if (title) {
					createDOM('span').css({
						'text-align': align,
						top: layout.text.y,
						left: layout.text.x,
						position: 'fixed',
						width: layout.text.width,
						height: layout.text.height,
						display: 'block',
						font: themeProcessor.cssFont(nodeTheme.font),
						color: fontColor
					}).text(title).appendTo(foreignObject);
				}

				return g;
			};
		layoutModel.setLayout(layout);
		_.each(layout.connectors, function (connector) {
			var fromNode = layout.nodes[connector.from],
				toNode = layout.nodes[connector.to];
			g.append(writeConnector(fromNode, toNode));
		});
		_.each(layout.links, function (link) {
			g.append(writeLink(link));
		});
		_.each(layout.nodes, function (node) {
			var offsetX = (node.x + clipRect.x),
				offsetY = (node.y + clipRect.y);
			if (offsetX + node.width >= 0 && offsetX <= clipRect.width && offsetY + node.height >= 0 && offsetY <= clipRect.height) {
				g.append(writeNode(node));
			}

		});

		return deferred.resolve(svg.serialize()).promise();
	};
};


$.fn.toImageWidget = function (imageBuilder, mapModel) {
	'use strict';
	var widget = this,
		themeProcessor = new MAPJS.ThemeProcessor(),
		dummyTextBox = $('<div>').css({position: 'absolute', visibility: 'hidden'}),
		textSizer = function (title, maxWidth, fontInfo) {
			var result;
			dummyTextBox.appendTo('body').text(title).css({'max-width': maxWidth, font: themeProcessor.cssFont(fontInfo)});
			result = {
				width: dummyTextBox.outerWidth(true) + 1,
				height: dummyTextBox.outerHeight(true) + 1
			};
			dummyTextBox.detach();
			return result;

		},
		toSvgString = function (svgString) {
			return 'data:image/svg+xml,' + svgString;
		},
		toCanvas = function (img, options) {
			var scale = (options && options.scale) || 1,
				width = img.width * scale,
				height = img.height * scale,
				canvas = $('<canvas>').attr({width: width, height: height})[0],
				ctx = canvas.getContext('2d');


			ctx.fillStyle = 'white';
			ctx.fillRect(0, 0, width, height);

			if (scale !== 1) {
				ctx.scale(scale, scale);
			}
			ctx.drawImage(img, 0, 0);
			return canvas;
		},
		toPNGImage = function (svgImg, options) {
			var canvas = toCanvas(svgImg, options),
				png = canvas.toDataURL('image/png'),
				pngImg = new Image();

			pngImg.src = png;
			return pngImg;
		};

	widget.click(function () {
		var scale = 1,
			thumbnail = {width: 500, height: 500},
			svgOnly = false,
			svgOptions = {clipRect: {width: thumbnail.width / scale, height: thumbnail.height / scale}};

		imageBuilder.generateSVG(MAPJS.DOMRender.theme, mapModel.getIdea(), textSizer, svgOptions).then(function (svgString) {
			var intermediateImg,
				intermediateImageLoaded = function () {
					var pngImg = toPNGImage(intermediateImg, {scale: scale});
					$('#container').empty().append(pngImg);
				};
			if (svgOnly) {
				$('#container').empty().append($(svgString));
			} else {
				intermediateImg = new Image();
				intermediateImg.onload = intermediateImageLoaded;
				intermediateImg.src = toSvgString(svgString); //domURL.createObjectURL(svgBlob);

			}

		});
	});
	return this;
};

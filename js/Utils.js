//Copyright Timur Vizaev 2014-2024
//
//FEM Studio

var Detector = {
	canvas: !! window.CanvasRenderingContext2D,
	webgl: ( function () { try { var canvas = document.createElement( 'canvas' ); return !! ( window.WebGLRenderingContext && ( canvas.getContext( 'webgl' ) || canvas.getContext( 'experimental-webgl' ) ) ); } catch( e ) { return false; } } )(),
	workers: !! window.Worker,
	fileapi: window.File && window.FileReader && window.FileList && window.Blob,

	getWebGLErrorMessage: function () {

		var element = document.createElement( 'div' );
		element.id = 'webgl-error-message';
		element.style.fontFamily = 'monospace';
		element.style.fontSize = '13px';
		element.style.fontWeight = 'normal';
		element.style.textAlign = 'center';
		element.style.background = '#fff';
		element.style.color = '#000';
		element.style.padding = '1.5em';
		element.style.width = '400px';
		element.style.margin = '5em auto 0';

		if ( ! this.webgl ) 
		{
			element.innerHTML = window.WebGLRenderingContext ? [
				'Your graphics card does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br />',
				'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'
			].join( '\n' ) : [
				'Your browser does not seem to support <a href="http://khronos.org/webgl/wiki/Getting_a_WebGL_Implementation" style="color:#000">WebGL</a>.<br/>',
				'Find out how to get it <a href="http://get.webgl.org/" style="color:#000">here</a>.'
			].join( '\n' );
		}

		return element;
	},

	addGetWebGLMessage: function ( parameters ) 
	{
		var parent, id, element;
		parameters = parameters || {};
		parent = parameters.parent !== undefined ? parameters.parent : document.body;
		id = parameters.id !== undefined ? parameters.id : 'oldie';
		element = Detector.getWebGLErrorMessage();
		element.id = id;
		parent.appendChild( element );
	}
};

function BuildFontTexture()
{
    var sideSize = 512;
    var lettersPerSide = 16;
    var fontSize = sideSize / lettersPerSide;
    var c = document.createElement('canvas');
    c.width = c.height = fontSize*lettersPerSide;
    var ctx = c.getContext('2d');
    ctx.font = 'bold ' + fontSize + 'px Monospace';
    var i=0;


    ctx.fillStyle = "#FFFFFF";
    ctx.globalAlpha = 0.5;
    ctx.fillRect(0, 0, _FontAspectRatio * sideSize, sideSize);
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = "#000000";
    
    for (var y = 0; y < lettersPerSide; y++) 
    {
      for (var x = 0; x < lettersPerSide; x++, i++) 
      {
        var ch = String.fromCharCode(i);
        // ctx.fillText(ch, x * fontSize, -(8 / 32) * fontSize + (y + 1) * fontSize);
        ctx.fillText(ch, x * _FontAspectRatio * fontSize, -(8 / 32) * fontSize + (y + 1) * fontSize);
      }
    }
    
    texture = new THREE.Texture(c);
    texture.flipY = false;
    texture.needsUpdate = true;

    return texture;
}

_FontAspectRatio = 0.6;

var FontTexture = BuildFontTexture(); 
function GetFontTextureCoordinates(charCode)
{
    if(!FontTexture) { FontTexture = BuildFontTexture(); }

    var lettersPerSide = 16;
    var cx = charCode % lettersPerSide;
    var cy = Math.floor(charCode / lettersPerSide);

    var tileSizeRatio =  1.0 / lettersPerSide;

    var u = _FontAspectRatio * tileSizeRatio * cx;
    var v = tileSizeRatio * cy;
    var deltaX = _FontAspectRatio * tileSizeRatio;
    var deltaY = tileSizeRatio;

    return [u, v, deltaX, deltaY];

}

function RenderSpectrumCanvas()
{
    let labelColor = '#000000';
    let height = 300;
    if(SpectrumCanvas == null)
    {
        SpectrumCanvas = document.createElement('canvas');
        SpectrumCanvas.id = 'spectrumCanvas';
        SpectrumCanvas.height = height;
    }

    var ctx = SpectrumCanvas.getContext("2d");
    ctx.clearRect(0, 0, SpectrumCanvas.width, SpectrumCanvas.height);

    ctx.fillStyle = '#555555';

    var margin = 10;
    var gradient = ctx.createLinearGradient(0, margin, 0, SpectrumCanvas.height - margin);

    let d = 1.0 / Spectrum.Colors.length;
    for(var i = 0; i < Spectrum.Colors.length; i++)
    {
        let c = Spectrum.Colors[i];
        let r = c.R * 255;
        let g = c.G * 255;
        let b = c.B * 255;
        gradient.addColorStop(d + i * d, 'rgb(' + r + ',' + g + ',' + b + ')');
    }
    
    ctx.fillStyle = gradient;
    var barWidth = 30;

    ctx.fillRect(margin, margin, barWidth, SpectrumCanvas.height - 2 * margin);

    // ctx.strokeStyle = labelColor;
    // ctx.lineWidth = 2;
    // ctx.strokeRect(margin, margin, barWidth, SpectrumCanvas.height - 2 * margin);

    ctx.fillStyle = labelColor;
    ctx.font = "14px Consolas";
    let nLabels = 5;

    let valueRange = Spectrum.Max - Spectrum.Min;
    let valueStep = valueRange / nLabels;
    let pixelStep = (SpectrumCanvas.height - 2 * margin) / nLabels;
    for(var i = 0; i <= nLabels; i++)
    {
        let value = Spectrum.Min + valueStep * i;
        let absValue = Math.abs(value);
        let asExp = absValue > 0 && absValue < 0.01 && i > 0 || absValue > 100000;
        let labelValue =  asExp ? Number(value).toExponential(2) : Number(value).toFixed(2);
        let yPos = margin + i * pixelStep;
        if(i == 0) { yPos += 10; }
        ctx.fillText(labelValue, margin + 35, yPos);
    }

    var descFields = GetViewDescriptionFields();
    var nFields = descFields.length;
    for(var i = 0; i < nFields; i++)
    {
        ctx.fillText(descFields[i], margin + 150, 20 + i * 20);
    }

    // return SpectrumCanvas;

}


// //Extending Canvas to draw roundRect
// CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) 
// {
// 	if (w < 2 * r) r = w / 2;
// 	if (h < 2 * r) r = h / 2;
// 	this.beginPath();
// 	this.moveTo(x+r, y);
// 	this.arcTo(x+w, y,   x+w, y+h, r);
// 	this.arcTo(x+w, y+h, x,   y+h, r);
// 	this.arcTo(x,   y+h, x,   y,   r);
// 	this.arcTo(x,   y,   x+w, y,   r);
// 	this.closePath();
// 	return this;
// }
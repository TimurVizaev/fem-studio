//Copyright Timur Vizaev 2014-2024
//
//FEM Studio

class FEXColor
{
    constructor(r, g, b)
    {
        this.R = r / 255.0;
        this.G = g / 255.0;
        this.B = b / 255.0;
        this.A = 1.0;
    }

    static GetRainbowColors(n)
    {
        var basicRainbow = [
            new FEXColor(0, 0, 255), //Blue
            new FEXColor(0, 255, 0), //Lime
            new FEXColor(255, 255, 0), //Yellow
            new FEXColor(255, 140, 0), //DarkOrange
            new FEXColor(255, 0, 0), //Red
        ];

        if(!n) { return basicRainbow; }

        var colors = [];
        var spectrumHelper = new ColorSpectrum(0, n, basicRainbow);

        for(var i = 0; i < n; i++)
        {
            colors.push(spectrumHelper.GetColor(i));
        }
        return colors;
    }

    static GetGradientColors(n)
    {
        var colors = [];
        var freq = 5.0 / n;
        for(var i = 0; i < n; i++)
        {
            var r = Math.floor(Math.sin(freq * i + 0) * 127 + 128);
            var g = Math.floor(Math.sin(freq * i + 2) * 127 + 128);
            var b = Math.floor(Math.sin(freq * i + 4) * 127 + 128);
            colors.push(new FEXColor(r, g, b));
        }
        return colors;
    }

    static IsSame(c1, c2) { return c1.R == c2.R && c1.G == c2.G && c1.B == c2.B; }

    ToArray() { return [ this.R, this.G, this.B ]; }

    FromArray(a) { this.R = a[0] / 255; this.G = a[1] / 255; this.B = a[2] / 255; }
}

class ColorSpectrum
{
    constructor(min, max, colors)
    {
        this.Min = min;
        this.Max = max;
        this.Colors = colors;
        this.UpdateRange();
        this.UpdateStep();
        this.IsSmooth = true;

        this.BelowMinColor = null;
        this.AboveMaxColor = null;
        this.NoneColor = new FEXColor(140, 140, 140);
    }

    SetMin(min)
    {
        this.Min = min;
        this.UpdateRange();
        this.UpdateStep();
    }

    SetMax(max)
    {
        this.Max = max;
        this.UpdateRange();
        this.UpdateStep();
    }

    SetRange(min, max)
    {
        this.Min = min;
        this.Max = max;
        this.UpdateRange();
        this.UpdateStep();
    }

    SetColors(colors)
    {
        this.Colors = colors;
        this.UpdateRange();
        this.UpdateStep();
    }

    AddColor(color)
    {
        this.Colors.push(color);
        this.UpdateStep();
    }

    GetColor(value)
    {
        if(value > this.Max) { return this.AboveMaxColor ? this.AboveMaxColor : this.Colors[this.Colors.length - 1]; }
        if(value < this.Min) { return this.BelowMinColor ? this.BelowMinColor : this.Colors[0]; }

        if(this.Step == 0)  { return this.Colors[0]; }
        if(value == undefined) { return this.NoneColor; }

        var colorIndex = Math.floor((value - this.Min) / this.Step);
        if(colorIndex < 0) { colorIndex = 0; }
        if(colorIndex > this.Colors.length - 2) { colorIndex = this.Colors.length - 2; }

        var c1 = this.Colors[colorIndex];
        var c2 = this.Colors[colorIndex + 1];

        if(this.IsSmooth)
        {
            var m = (value - this.Min) / this.Step - colorIndex;
            return this.Interpolate(c1, c2, m);
        }
        else
        {
            if(colorIndex === 0) { return c1; }
            else { return c2; }
        }
    }

    static Rainbow(min, max)
    {
        var colors = FEXColor.GetRainbowColors();
        var spectrum = new ColorSpectrum(min, max, colors);
        // spectrum.InsertItermediateColors(1);
        return spectrum;
    }

    InsertItermediateColors(n)
    {
        var oldColors = this.Colors.slice();
        for(var i = 0; i < oldColors.length - 1; i++)
        {
            var c0 = oldColors[i];
            var c1 = oldColors[i + 1];
            for(var j = 0; j < n; j++)
            {
                var m = (j + 1) / n;
                var c01 = this.Interpolate(c0, c1, m);
                this.Colors.splice(i + j, c01);
            }
        }
        this.UpdateStep();
    }

    UpdateRange() { this.Range = this.Max - this.Min; }
    UpdateStep() { this.Step = this.Range / (this.Colors.length - 1); }

    Interpolate(c1, c2, m)
    {
        var r = 255 * (m * (c2.R - c1.R) + c1.R);
        var g = 255 * (m * (c2.G - c1.G) + c1.G);
        var b = 255 * (m * (c2.B - c1.B) + c1.B);
        var a = 255 * (m * (c2.A - c1.A) + c1.A);
        return new FEXColor(r, g, b);
    }

    GetColorByPos(pos)
    {
        while(pos >= this.Colors.length) { pos -= this.Colors.length; }
        return this.Colors[pos];
    }

    ToArray()
    {
        var array = [];
        for(var i = 0; i < this.Colors.length; i++)
        {
            let c = this.Colors[i];
            array.push(c.R, c.G, c.B);
        }
        return array;
    }

    UpdateUniforms(uniforms)
    {
        uniforms.colors.value = this.ToArray();
        uniforms.colorsLength.value = this.Colors.length;
        uniforms.aboveMaxColor.value = this.AboveMaxColor ? this.AboveMaxColor.ToArray() : this.Colors[this.Colors.length - 1].ToArray();
        uniforms.belowMinColor.value = this.BelowMinColor ? this.BelowMinColor.ToArray() : this.Colors[0].ToArray();
        uniforms.noneColor.value = this.NoneColor.ToArray();
    }

}


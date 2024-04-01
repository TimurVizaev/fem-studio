//Copyright Timur Vizaev 2014-2024
//
//FEM Studio

var ViewOptDefault = function() 
{
    this.Style = 'to bottom',
    this.Color1 = "#f8f8f8",
    this.Color2 = "#aaaaaa",
    this.Load = function() { document.getElementById('fileInput').click(); }
    this.FitView = function () { FitToView(); }
};

var SelOptDefault = function()
{
    this.SelectionEnabled = true,
    this.HoverEnabled = true,
    this.Node = true,
    this.Element0D = true,
    this.Element1D = true,
    this.Element2D = true,
    this.Element3D = true,
    this.Connector = true,
    this.MPC = true,
    this.StickySelection = false
};

var FEMOptDefault = function()
{
    this.Mode = 'Standard';
    this.CustomModeString = '';
    this.Opacity = 0.9;
    this.Node = false,
    this.Element0D = true,
    this.Element1D = true,
    this.Element2D = true,
    this.Element3D = true,
    this.Connector = true,
    this.MPC = true,
    this.ShowLabels = false,
    this.NodesColor = [0, 153, 144],
    this.Elements0DColor = [170, 0, 0],
    this.Elements1DColor = [0, 70, 200],
    this.Elements2DColor = [255, 169, 46],
    this.Elements3DColor = [255, 61, 118],
    this.MPCsColor = [100, 0, 200],
    this.ConnectorsColor = [255, 21, 200],
    this.Wireframe = true,
    this.WireframeColor = [0, 0, 0],
    this.NodeSize = 2.0
};

var ResOptDefault = function()
{
    this.Subcase = 0;
    this.Mode = 0;
    this.Result = 'Displacements';
    this.Scale = 1.0;
    this.Animate = true;
    this.AnimateColors = false;
    this.AnimationSpeed = 1.0;
    this.Deformed = true;
    this.Undeformed = false;
    this.VectorComponent = 'Magnitude';
    this.TensorComponent = 'VonMises';
    this.Layer = 'Max';
    this.Value = 'Max';
    this.SpectrumColor1 = [0, 0, 255],
    this.SpectrumColor2 = [0, 255, 0],
    this.SpectrumColor3 = [255, 255, 0],
    this.SpectrumColor4 = [255, 140, 0],
    this.SpectrumColor5 = [255, 0, 0],
    this.NoneColor = [140, 140, 140],
    this.UseAboveMaxColor = false,
    this.AboveMaxColor = [168, 0, 10],
    this.UseBelowMinColor = false,
    this.BelowMinColor = [0, 0, 0],
    this.AutomaticRange = true,
    this.Min = 0,
    this.Max = 100,
    this.HideElementsOutsideOfRange = false,
    this.DynamicPointSize = false,
    this.MinNodeSize = 1.0,
    this.MaxNodeSize = 10.0,
    this.AutoShowItems = true,
    this.ComputeEnvelope = function() { ComputeEnvelope(); },
    this.EnvelopeMode = 'Max',
    this.EnvelopeVisibleOnly = true
};

var ToolsOptDefault = function()
{
    this.ExportAttachedValues = function() { ExportAttachedValues(); }
    this.TakeScreenshot = function() { TakeScreenshot(); }
    this.ImageIncludeSpectrum = true,
    this.ImageUseCustomSize = false,
    this.ImageWidth = '800',
    this.ImageHeight = '600',
    this.ImageTransparent = false,
    this.RecordVideo = function() { RecordVideo(); }
    this.VideoFramerate = '24',
    this.VideoDuration = 2,
    this.VideoFormat = 'webm',
    this.VideoUseCustomSize = true,
    this.VideoWidth = '800',
    this.VideoHeight = '600',
    this.VideoTotalFrames = 60
};

var ViewOpt = new ViewOptDefault();
var SelOpt = new SelOptDefault();
var FEMOpt = new FEMOptDefault();
var ResOpt = new ResOptDefault();
var ToolsOpt = new ToolsOptDefault();


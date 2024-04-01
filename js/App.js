//Copyright Timur Vizaev 2014-2024
//
//FEM Studio

"use strict";

const NoResult = -1e10;
var CurrentTime = 0;
var container = document.getElementById('container');

function OpenFile(event) { var file = event.target.files[0]; if(!file) { return; } LoadFile(file); };
function LoadFile(file)
{
    let ext = file.name.split('.').pop().toUpperCase();
    if(ext == "OP2") { LoadOP2(file); }
    else { LoadModel(file); }
}

if (!Detector.webgl) { Detector.addGetWebGLMessage(); }

var Camera;
var Raycaster;
var Scene;
var Renderer;
var Controls;

var MousePos = new THREE.Vector2();

var FEM = null;
var Results = null;

var SelectionManager;

//Hover/Selection Geometries
var SelectionGeometry = new THREE.Geometry();
var SelectedMesh = new THREE.Mesh(SelectionGeometry, SelectionLineMaterial);
SelectedMesh.renderOrder = 3;
SelectedMesh.frustumCulled = false;

var HoverGeometry = new THREE.Geometry();
var HoverMesh = new THREE.Mesh(HoverGeometry, HoverLineMaterial);
HoverMesh.renderOrder = 4;
HoverMesh.frustumCulled = false;

var HoverLineGeometry = new THREE.Geometry();
var HoverLines = new THREE.LineSegments(HoverLineGeometry, HoverPointMaterial);
HoverLines.renderOrder = 5;
HoverLines.frustumCulled = false;

// var HoverPointGeometry = new THREE.Geometry();

var HoverPointGeometry = new THREE.BufferGeometry();
var positions = new Float32Array( 100 * 3 ); // 3 vertices per point
HoverPointGeometry.addAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );

var SelectionLineGeometry = new THREE.Geometry();
var SelectionLines = new THREE.LineSegments(SelectionLineGeometry, SelectionLineMaterial);
SelectionLines.renderOrder = 6;
SelectionLines.frustumCulled = false;

// var HoverPoints = new THREE.Points(HoverPointGeometry, HoverPointMaterial);
// HoverPoints.renderOrder = 5;
// HoverPoints.frustumCulled = false;
// Scene.add(HoverPoints);

const RenderMode = { Standard: 0, Material: 1, Property: 2, Thickness: 3, ID: 4, Topology: 5, Normal: 6, Group: 7, Results: 8, Custom: 9 };

Init();

var HoverLabel;
function Init() 
{
    //Camera
    let aspect  = window.innerHeight / window.innerWidth;
    let frustumSize = 5;
    Camera = new THREE.OrthographicCamera(frustumSize  / - 2, frustumSize / 2, frustumSize * aspect / 2, frustumSize * aspect / - 2, -10000, 100000);
    Camera.up = new THREE.Vector3(0, 0, 1);

    //Renderer
    Renderer = new THREE.WebGLRenderer({antialias: true, alpha: true });
    Renderer.setPixelRatio(window.devicePixelRatio);
    Renderer.setSize(window.innerWidth, window.innerHeight);
    Renderer.setClearColor(0x2F3E6B, 0); 
    Renderer.shadowMap.enabled = false;
    Renderer.shadowMapSoft = false;
    container.appendChild(Renderer.domElement);

    //Raycaster
    Raycaster = new THREE.Raycaster();
    Raycaster.linePrecision = 10;

    //Scene
    Scene = new THREE.Scene();
    Scene.add(new THREE.AmbientLight(0xffffff)); //we probably should add some additional lights

    //Selection
    SelectionManager = new ISelectionManager();

    //Events
    window.addEventListener('resize', OnWindowResize, false);  
    container.addEventListener('mousemove', OnMouseMove, true);
    container.addEventListener('mouseup', OnMouseUp, true);
    document.addEventListener('keyup', OnKeyUp, true);

    //Controls
    Controls = new THREE.OrbitControls(Camera, Renderer.domElement);
    Controls.addEventListener('change', render);

    function preventDefaults (e) { e.preventDefault(); e.stopPropagation(); }
    ['dragenter', 'dragleave', 'dragover', 'drop'].forEach(eventName => { container.addEventListener(eventName, preventDefaults, false); });

    function handleDrop(e) { let file = e.dataTransfer.files[0]; if(file) { LoadFile(file); } }
    container.addEventListener('drop', handleDrop, false);
    
    OnWindowResize();
    SetBackground();
    UpdateFEMColor();
    InitGUI();
    Animate();
}

var HoverLabelVisible = false;
function ShowHoverLabel(show = true)
{
    if(!HoverLabel) { HoverLabel = CreateTextLabel(); container.appendChild(HoverLabel.element); }
    if(show != HoverLabelVisible) { HoverLabel.element.style.display = show ? 'block' : 'none'; HoverLabelVisible = show; }
}

function OnWindowResize() { SetRendererSize(window.innerWidth,  window.innerHeight); }

function Animate() 
{
    Controls.update();
    render();
    requestAnimationFrame(Animate);
}

var IsRecording = false;
var FramesRecorded = 0;
var Capturer;
function RecordVideo()
{
    if(IsRecording) { return; }
    Capturer = new CCapture( { format: ToolsOpt.VideoFormat, framerate: parseInt(ToolsOpt.VideoFramerate), name: GetViewDescription() } );
    CurrentTime = 0;
    FramesRecorded = 0;
    IsRecording = true;
    if(ToolsOpt.VideoUseCustomSize) { SetRendererSize(ToolsOpt.VideoWidth, ToolsOpt.VideoHeight); }
    Scene.background = new THREE.Color(0xdddddd);
    ShowLoading();
    Controls.enabled = false; 
}

function StopRecording()
{
    Capturer.stop();
    Capturer.save();
    Capturer = null;
    Scene.background = null;
    if(ToolsOpt.VideoUseCustomSize) { SetRendererSize(window.innerWidth,  window.innerHeight); }
    IsRecording = false;
    Controls.enabled = true;
    ShowLoading(false);
}

function render() 
{
    Raycaster.setFromCamera(MousePos, Camera);

    if(FEM)
    {
        LabelUniforms.scale.value = Camera.zoom / InitialZoom;
        ZoomIndependentSize = ModelSize * Math.sqrt(InitialZoom) / (20 * Math.sqrt(Camera.zoom));

        CurrentTime += IsRecording ? 2 * Math.PI / ToolsOpt.VideoTotalFrames : ResOpt.AnimationSpeed * 0.05;
        if(ResOpt.Animate)
        {
            let d = ResOpt.Mode > 0 ? Math.cos(CurrentTime) :  0.5 + 0.5 * Math.cos(CurrentTime);
            MeshUniforms.delta.value = d;
            WireframeUniforms.delta.value = d;
        }

        if(ResOpt.AnimateColors)
        {
            let d = ResOpt.Mode > 0 ? Math.abs(Math.cos(CurrentTime)) : 0.5 + 0.5 * Math.cos(CurrentTime);
            MeshUniforms.colorDelta.value = d;
            WireframeUniforms.colorDelta.value = d;
        }

        Renderer.render(Scene, Camera);

        if(IsRecording)
        {
            if(FramesRecorded == 0) { Capturer.start(); }
            if(FramesRecorded < ToolsOpt.VideoTotalFrames)
            {
                FramesRecorded++;
                Capturer.capture(Renderer.context.canvas);
            }
            else { StopRecording(); }
        }

    }
}

var MainGUI;
var DisplayModeCombo;
var CustomModeTextbox;
function InitGUI()
{
    EnableGUITooltips();

    MainGUI = new dat.GUI();
    MainGUI.add(ViewOpt, 'Load').name('Load Model');
    var folder = MainGUI.addFolder('Display');
    DisplayModeCombo = folder.add(FEMOpt, 'Mode', Object.keys(RenderMode)).onChange(RenderModeChanged);
    
    var folder2 = folder.addFolder('Show');
    folder2.add(FEMOpt, 'Node').onChange(UpdateNodesVisibility);
    folder2.add(FEMOpt, 'Element0D').name('Elements 0D').onChange(UpdateElements0DVisibility);
    folder2.add(FEMOpt, 'Element1D').name('Elements 1D').onChange(UpdateElements1DVisibility);
    folder2.add(FEMOpt, 'Element2D').name('Elements 2D').onChange(UpdateElements2DVisibility);
    folder2.add(FEMOpt, 'Element3D').name('Elements 3D').onChange(UpdateElements3DVisibility);
    folder2.add(FEMOpt, 'MPC').name('MPCs').onChange(UpdateMPCsVisibility);
    folder2.add(FEMOpt, 'Connector').name('Connectors').onChange(UpdateConnectorsVisibility);
    folder2.add(FEMOpt, 'Wireframe').onChange(UpdateWireframeVisibility);
    folder2.add(FEMOpt, 'Opacity', 0.0, 1.0).onChange(UpdateFEMOpacity);
    folder2.add(FEMOpt, 'NodeSize',  1.0, 10.0).name('Node Size').onChange(NodeSizeChanged);
    var folder3 = folder2.addFolder("Colors");
    folder3.addColor(FEMOpt, 'NodesColor').name('Nodes').onChange(UpdateFEMColor);
    folder3.addColor(FEMOpt, 'Elements0DColor').name('Elements 0D').onChange(UpdateFEMColor);
    folder3.addColor(FEMOpt, 'Elements1DColor').name('Elements 1D').onChange(UpdateFEMColor);
    folder3.addColor(FEMOpt, 'Elements2DColor').name('Elements 2D').onChange(UpdateFEMColor);
    folder3.addColor(FEMOpt, 'Elements3DColor').name('Elements 3D').onChange(UpdateFEMColor);
    folder3.addColor(FEMOpt, 'MPCsColor').name('MPCs').onChange(UpdateFEMColor);
    folder3.addColor(FEMOpt, 'ConnectorsColor').name('Connectors').onChange(UpdateFEMColor);
    folder3.addColor(FEMOpt, 'WireframeColor').name('Wireframe').onChange(WireframeColorChanged);
    folder3 = folder2.addFolder('Labels');
    folder3.add(FEMOpt, 'ShowLabels').name('Show Labels').onChange(ShowLabelsFEM);
    folder.open();

    folder = MainGUI.addFolder('Selection');
    folder.add(SelOpt, 'SelectionEnabled').name('Selection Enabled');
    folder.add(SelOpt, 'HoverEnabled').name('Hover Enabled');
    folder.add(SelOpt, 'StickySelection').name('Sticky');
    folder2 = folder.addFolder("Filter");
    //folder2.add(SelOpt, 'Node');
    folder2.add(SelOpt, 'Element0D').name('Elements 0D');
    folder2.add(SelOpt, 'Element1D').name('Elements 1D');
    folder2.add(SelOpt, 'Element2D').name('Elements 2D');
    folder2.add(SelOpt, 'Element3D').name('Elements 3D');
    folder2.add(SelOpt, 'MPC');
    folder2.add(SelOpt, 'Connector');
    folder2.open();

    folder = MainGUI.addFolder('Viewer');
    MainGUI.add(ViewOpt, 'FitView').name('Fit View');
    folder.addColor(ViewOpt, 'Color1').name('Color 1').onChange(SetBackground);
    folder.addColor(ViewOpt, 'Color2').name('Color 2').onChange(SetBackground);
    folder.add(ViewOpt, 'Style',  { Radial:'radial', Vertical:'to bottom', Horizontal:'to right', LeftCorner :'to top left', RightCorner: 'to top right' }).onChange(SetBackground);

    folder = MainGUI.addFolder('Tools');
    folder.add(ToolsOpt, 'ExportAttachedValues').name('Export Attached Values');
    folder.add(ToolsOpt, 'TakeScreenshot').name('Take Screenshot');
    folder2 = folder.addFolder('Screenshot Options');
    folder2.add(ToolsOpt, 'ImageIncludeSpectrum').name('Include Spectrum');
    folder2.add(ToolsOpt, 'ImageTransparent').name('Transparent');
    folder2.add(ToolsOpt, 'ImageUseCustomSize').name('Custom Size');
    folder2.add(ToolsOpt, 'ImageWidth').name('Width');
    folder2.add(ToolsOpt, 'ImageHeight').name('Height');
    folder.add(ToolsOpt, 'RecordVideo').name('Record Video');
    folder2 = folder.addFolder('Video Options');
    folder2.add(ToolsOpt, 'VideoFramerate', ['12', '24', '30', '60' ]).name('Framerate').onChange(VideoOptionsChanged);
    folder2.add(ToolsOpt, 'VideoDuration', 1, 8).name('Duration').onChange(VideoOptionsChanged);
    folder2.add(ToolsOpt, 'VideoFormat', ['webm', 'png', 'jpg' ]).name('Format');
    folder2.add(ToolsOpt, 'VideoUseCustomSize').name('Custom Size');
    folder2.add(ToolsOpt, 'VideoWidth').name('Width');
    folder2.add(ToolsOpt, 'VideoHeight').name('Height');

    //MainGUI.remember(ViewOpt);
}

function VideoOptionsChanged() { ToolsOpt.VideoTotalFrames = parseInt(ToolsOpt.VideoFramerate) * ToolsOpt.VideoDuration; }

function TakeScreenshot()
{
    if(ToolsOpt.ImageUseCustomSize) { SetRendererSize(ToolsOpt.ImageWidth, ToolsOpt.ImageHeight); }

    var c = document.createElement('canvas');
    var ctx = c.getContext('2d');

    c.width = ToolsOpt.ImageUseCustomSize ? ToolsOpt.ImageWidth : window.innerWidth;
    c.height = ToolsOpt.ImageUseCustomSize ? ToolsOpt.ImageHeight : window.innerHeight;

    if(!ToolsOpt.ImageTransparent) { ctx.fillStyle = 'white'; ctx.fillRect(0, 0, c.width, c.height); }

    Renderer.render(Scene, Camera);
    ctx.drawImage(Renderer.domElement, 0, 0);
    if(ToolsOpt.ImageIncludeSpectrum && Spectrum) { ctx.drawImage(SpectrumCanvas, 0, 0); }

    c.toBlob(function(blob)
    {
        var a = document.createElement('a');
        var url = URL.createObjectURL(blob);
        a.href = url; a.download = GetViewDescription() + '.png'; a.click(); 
    }, 'image/png', 1.0);

    if(ToolsOpt.ImageUseCustomSize) { SetRendererSize(window.innerWidth, window.innerHeight); }
}

function ExportAttachedValues()
{
    if(!FEM) { return; }

    let m = GetRenderMode();
    if(m == RenderMode.Standard) { vex.dialog.alert("Please select a Render Mode"); return; }

    var array = [];

    for(const [k, e] of FEM.Elements.Cards.entries())
    {
        if(!e.IsVisible() || !e.AttachedValue || e.AttachedValue == NoResult) { continue; }
        var line = k + " " + e.AttachedValue;
        if(IsEnvelope && e.EnvelopeSource) { line += " " + ResultCaseSourceToString(e.EnvelopeSource); }
        array.push(line + "\n");
    }

    if(array.length == 0)
    {
        for(const [k, n] of FEM.Nodes.Cards.entries())
        {
            if(!n.AttachedValue || n.AttachedValue == NoResult) { continue; } //TODO add check for hidden nodes / nodes with all elements hidden
            var line = k + " " + n.AttachedValue;
            if(IsEnvelope && n.EnvelopeSource) { line += " " + ResultCaseSourceToString(n.EnvelopeSource); }
            array.push(line + "\n");
        }
    }

    if(array.length == 0)
    {
        vex.dialog.alert("No results are displayed");
        return;
    }
    var blob = new Blob(array, {type: "text/plain;charset=utf-8"});

    
    saveAs(blob, GetViewDescription() + ".txt");
}

function ResultCaseSourceToString(source)
{
    var str = 'Subcase_' + source.Subcase;
    if(source.Mode) { str += '_Mode_' + source.Mode; }
    return str;
}

function GetViewDescription() { return GetViewDescriptionFields().join('_').replace(/\s+/g, ''); }

function GetViewDescriptionFields()
{
    var fields = [];

    let m = GetRenderMode();
    fields.push(FEM.Filename);
    if(m == RenderMode.Results)
    {
        if(IsEnvelope)
        {
            fields.push("Envelope (" + ResOpt.EnvelopeMode + ")");
        }
        else
        {
            if(ResOpt.Subcase > 0) { fields.push("Subcase " + ResOpt.Subcase); }
            if(ResOpt.Mode > 0) { fields.push("Mode - " + ResOpt.Mode + (ModeEigenvalue ? " (" + ModeEigenvalue.toFixed(2) + " Hz)" : "")); }
        }
        fields.push(ResOpt.Result);
        fields.push(GetResultDescription());
    }
    else
    {
        fields.push(FEMOpt.Mode);
    }

    return fields;
}

function GetResultDescription()
{
    let t = ResultsType[ResOpt.Result];
    let c = GetResultComponentKey(t);
    if(c == ResultComponentGUIKey.Stress)
    {
        return ResOpt.TensorComponent + " (" + ResOpt.Layer + ")";
    }
    else if(c == ResultComponentGUIKey.Bar)
    {
        //TODO
    }
    else if(c == ResultComponentGUIKey.Vectorial)
    {
        return ResOpt.VectorComponent;
    }
}

function CustomModeChanged()
{
    if(GetRenderMode() != RenderMode.Custom) { return; }
    if(!FEM) { return; }
    FEM.SetRenderMode(RenderMode.Custom);
}

function WireframeColorChanged()
{
    let c = FEMOpt.WireframeColor;
    WireframeUniforms.color.value = [ c[0] / 255.0, c[1] / 255.0 , c[2] / 255.0 ];
}

function NodeSizeChanged()
{
    MeshUniforms.nodeSize.value = FEMOpt.NodeSize;
}

var ResultsGUI;
var AvailableResultsCombo;
var DisplacementsScaleSlider;
var ForcesFolder;
var SpectrumFolder;
var AutomaticRangeCheckbox;
var UseAboveMaxColorCheckbox;
var UseBelowMinColorCheckbox;
var MinRangeTextbox;
var MaxRangeTextbox;
var CurrentSubcaseCombobox;
var CurrentModeCombobox;

var ResultComponentsGUIs = new Map();


function AddResultsGUI(results)
{
    var subcase0 = Results.Subcases.values().next().value;
    if(!subcase0) { return; }

    if(!ResultsGUI) { ResultsGUI = new dat.GUI(); }

    var resultCase = subcase0;

    var caseLabels = [];
    for(const k of results.keys()) { caseLabels.push(k); }
    CurrentSubcaseCombobox = ResultsGUI.add(ResOpt, 'Subcase', caseLabels).onChange(CurrentSubcaseChanged);
    ResOpt.Subcase = subcase0.ID;
    CurrentSubcaseCombobox.updateDisplay();

    if(subcase0.ContainsModalData)
    {
        var modeLabels = [];
        for(const k of subcase0.Modes.keys()) { modeLabels.push(k); }
        CurrentModeCombobox = ResultsGUI.add(ResOpt, 'Mode', modeLabels).onChange(UpdateSelectedResult);
        ResOpt.Mode = modeLabels[0];
        CurrentModeCombobox.updateDisplay();

        resultCase = subcase0.Modes.values().next().value;
    }

    var availableResults = resultCase.GetAvailableResults();
    
    if(results.length == 0 || availableResults.length == 0) { Console.info("No results were available"); return; }

    var availableResultsLabels = [];
    for(var i = 0; i < availableResults.length; i++)
    {
        var r = Object.keys(ResultsType).find(k => ResultsType[k] === availableResults[i]);
        availableResultsLabels.push(r);
    }

    if(AvailableResultsCombo) { ResultsGUI.remove(AvailableResultsCombo); }
    AvailableResultsCombo = ResultsGUI.add(ResOpt, 'Result', availableResultsLabels).onChange(SelectedResultTypeChanged);
    ResOpt.Result = availableResultsLabels[0];
    AvailableResultsCombo.updateDisplay();

    var folder = ResultsGUI.addFolder('Deformation');
    folder.add(ResOpt, 'Deformed').onChange(UpdateDeformed);
    folder.add(ResOpt, 'Undeformed').onChange(DisplayUndeformed);
    folder.add(ResOpt, 'Scale', 0.01, 100.0).onChange(UpdateScale)
    folder.add(ResOpt, 'VectorComponent', Object.keys(VectorialComponent)).name('Component').onChange(UpdateSelectedResult);

    folder = ResultsGUI.addFolder('Animation');
    folder.add(ResOpt, 'Animate').name('Deformation').onChange(AnimateChanged);
    folder.add(ResOpt, 'AnimateColors').name('Colors').onChange(AnimateColorsChanged);
    folder.add(ResOpt, 'AnimationSpeed', 0.25, 4.0).name('Animation Speed');

    SpectrumFolder = ResultsGUI.addFolder('Spectrum');
    SpectrumFolder.addColor(ResOpt, 'SpectrumColor1').name('Color 1').onChange(UpdateSpectrumColors);
    SpectrumFolder.addColor(ResOpt, 'SpectrumColor2').name('Color 2').onChange(UpdateSpectrumColors);
    SpectrumFolder.addColor(ResOpt, 'SpectrumColor3').name('Color 3').onChange(UpdateSpectrumColors);
    SpectrumFolder.addColor(ResOpt, 'SpectrumColor4').name('Color 4').onChange(UpdateSpectrumColors);
    SpectrumFolder.addColor(ResOpt, 'SpectrumColor5').name('Color 5').onChange(UpdateSpectrumColors);
    SpectrumFolder.addColor(ResOpt, 'NoneColor').name('None Color').onChange(UpdateSpectrumColors);
    UseAboveMaxColorCheckbox = SpectrumFolder.add(ResOpt, 'UseAboveMaxColor').name('Use Above Max Color').onChange(UpdateSpectrumColors);
    SpectrumFolder.addColor(ResOpt, 'AboveMaxColor').name('Above Max Color').onChange(UpdateSpectrumColors);
    UseBelowMinColorCheckbox = SpectrumFolder.add(ResOpt, 'UseBelowMinColor').name('Use Below Min Color').onChange(UpdateSpectrumColors);
    SpectrumFolder.addColor(ResOpt, 'BelowMinColor').name('Below Min Color').onChange(UpdateSpectrumColors);

    SpectrumFolder.add(ResOpt, 'HideElementsOutsideOfRange').name('Hide Failed Elements').onChange(HideElementsOutsideOfRangeChanged);

    folder = ResultsGUI.addFolder('Points');
    folder.add(ResOpt, 'DynamicPointSize').name('Dynamic Size').onChange(NodeSizeRangeChanged).tooltip('Increase point size depending on result');
    folder.add(ResOpt, 'MinNodeSize',  1.0, 20.0).name('Min Size').onChange(NodeSizeRangeChanged);
    folder.add(ResOpt, 'MaxNodeSize',  1.0, 20.0).name('Max Size').onChange(NodeSizeRangeChanged);
    
    MinRangeTextbox = ResultsGUI.add(ResOpt, 'Min').onChange(SpectrumRangeChanged);
    MaxRangeTextbox = ResultsGUI.add(ResOpt, 'Max').onChange(SpectrumRangeChanged);
    AutomaticRangeCheckbox = ResultsGUI.add(ResOpt, 'AutomaticRange').name('Automatic Range').onChange(AutomaticRangeChanged);
    ResultsGUI.add(ResOpt, 'AutoShowItems').name('With Results Only').onChange(AutoShowChanged).tooltip('Display only entities with results');

    folder = ResultsGUI.addFolder('Tools');
    folder.add(ResOpt, 'ComputeEnvelope').name('Envelope');
    folder.open();
    var folder2 = folder.addFolder('Envelope Options');
    folder2.add(ResOpt, 'EnvelopeMode', Object.keys(EnvelopeMode)).name('Mode');

    Spectrum = ColorSpectrum.Rainbow(ResOpt.Min, ResOpt.Max);
    Spectrum.UpdateUniforms(MeshUniforms);

    FEMOpt.Mode = 'Results';
    DisplayModeCombo.updateDisplay();
    RenderModeChanged();
}

var IsEnvelope = false;
const EnvelopeMode = { Min: 0, Max: 1, AbsoluteMax: 2 };
function ComputeEnvelope()
{
    //envelope options.. min or max, visible only..
    //start envelope computation..

    IsEnvelope = true;
    ShowLoading();
    var doWork = function() 
    {
        for(const e of FEM.Elements.Cards.values()) { e.AttachedValue = NoResult; e.AttachedResult = undefined; e.EnvelopeSource = undefined; }
        if(IsNodalResult())
        {
            for(const n of FEM.Nodes.Cards.values()) { n.AttachedValue = NoResult; n.AttachedResult = undefined; n.EnvelopeSource = undefined; }
        }
        
        for(const [subcaseId, subcase] of Results.Subcases.entries())
        {
            var source = { Subcase: subcaseId }
            if(subcase.ContainsModalData)
            {
                for(const [modeId, mode] of subcase.Modes.entries())
                {
                    source.Mode = modeId;
                    AddToEnvelope(mode, source);
                }
            }
            else
            {
                AddToEnvelope(subcase, source);
            }
        }

        if(IsNodalResult())
        {
            for(const n of FEM.Nodes.Cards.values()) { n._Disp = undefined; }
            FEM.UpdateDisplacements();
        }
        
        UpdateResultsRange(true);
        FEM.UpdateValuesAttribute(false, IsNodalResult());
        ShowLoading(false);
    }
    setTimeout(doWork, 10);
}

function AddToEnvelope(resultCase, source)
{
    let t = ResultsType[ResOpt.Result];
    var results = resultCase.GetResults(t);

    var checkVisibility = ResOpt.EnvelopeVisibleOnly;
    var mode = EnvelopeMode[ResOpt.EnvelopeMode];

    if(IsElementalResult())
    {
        var component = TensorialComponent[Object.keys(TensorialComponent).find(k => k == ResOpt.TensorComponent)];
        var fetching = FetchingType[Object.keys(FetchingType).find(k => k == ResOpt.Layer)];

        for(const [k, e] of FEM.Elements.Cards.entries())
        {
            if(checkVisibility && !e.IsVisible()) { continue; }
            var r = results.get(k);
            if(r && r.Values.length > 0)
            {
                let v = r.GetValue(component, fetching);

                let update;
                if(mode == EnvelopeMode.Max) { update = e.AttachedValue < v; }
                else if(mode == EnvelopeMode.Min) { update = e.AttachedValue > v; }
                else if(mode == EnvelopeMode.AbsoluteMax) { update = e.AttachedValue < Math.abs(v); }
                if(update || e.AttachedValue == undefined || e.AttachedValue == NoResult)
                {
                    e.AttachedValue = v;
                    e.AttachedResult = r;
                    e.EnvelopeSource = source;
                }
            }
        }
    }
    else
    {
        var component = VectorialComponent[Object.keys(VectorialComponent).find(k => k == ResOpt.VectorComponent)];
        var nodesAreVisible = FEMOpt.Node;

        for(const [k, n] of FEM.Nodes.Cards.entries())
        {
            if(nodesAreVisible || !n.AllElementsAreHidden()) //TODO add checkVisibility
            {
                var r = results.get(k);
                if(r && r.Values.length > 0)
                {
                    let vec = r.Values[0].GetVector(VectorialComponent.Magnitude);

                    n.SetDisp(vec); n._Disp.Keep(component);
                    let v = n._Disp.Magnitude();

                    let update;
                    if(mode == EnvelopeMode.Max) { update = n.AttachedValue < v; }
                    else if(mode == EnvelopeMode.Min) { update = n.AttachedValue > v; }
                    else if(mode == EnvelopeMode.AbsoluteMax) { update = n.AttachedValue < Math.abs(v); }
                    if(update || n.AttachedValue == undefined || n.AttachedValue == NoResult)
                    {
                        n.AttachedValue = v;
                        n.AttachedResult = r;
                        n.EnvelopeSource = source;
                    }
                }
            }

        }
    }
}

function SelectedResultTypeChanged()
{
    let t = ResultsType[ResOpt.Result];
    ShowResultComponentGUI(t);
    UpdateSelectedResult();
}

var ResultComponentGUI;
function ShowResultComponentGUI(rType)
{
    let ct = GetResultComponentKey(rType);
    var gui = ResultComponentsGUIs.get(ct);
    if(!gui)
    {
        gui = new dat.GUI();
        ResultComponentsGUIs.set(ct, gui);

        if(ct == ResultComponentGUIKey.Stress)
        {
            gui.add(ResOpt, 'TensorComponent', Object.keys(TensorialComponent)).name('Component').onChange(UpdateSelectedResult);
            gui.add(ResOpt, 'Layer', Object.keys(FetchingType)).name('Layer').onChange(UpdateSelectedResult);
        }
        else if(ct == ResultComponentGUIKey.Bar)
        {

            gui.add(ResOpt, 'Value', Object.keys(FetchingType)).name('Value').onChange(UpdateSelectedResult);

        }
        else if(ct == ResultComponentGUIKey.Vectorial)
        {

            gui.add(ResOpt, 'TensorComponent', Object.keys(TensorialComponent)).name('Component').onChange(UpdateSelectedResult);
        }
    }

    if(ResultComponentGUI == gui) { return; }
    else if(ResultComponentGUI) { ResultComponentGUI.hide(); }

    gui.show();
    ResultComponentGUI = gui; 
}

function HideResultComponentGUI()
{
    if(ResultComponentGUI)
    {
        ResultComponentGUI.close();
    }
    
}

const ResultComponentGUIKey = { Vectorial: 0, Stress: 1, Bar: 2 }
function GetResultComponentKey(t)
{
    if(t == ResultsType.Stress || t == ResultsType.Strains) { return ResultComponentGUIKey.Stress; }
    if(t == ResultsType.BarForces || t == ResultsType.BarStress || t == ResultsType.BarStrains) { return ResultComponentGUIKey.Bar; }
    return ResultComponentGUIKey.Vectorial;
}


function NodeSizeRangeChanged()
{
    MeshUniforms.nodeSizeDynamic.value = ResOpt.DynamicPointSize;
    MeshUniforms.minNodeSize.value = ResOpt.MinNodeSize;
    MeshUniforms.maxNodeSize.value = ResOpt.MaxNodeSize;
}

function HideElementsOutsideOfRangeChanged()
{
    let h = ResOpt.HideElementsOutsideOfRange ? 1.0 : 0.0;
    MeshUniforms.hide.value = h;
    WireframeUniforms.hide.value = h;
}


function AutoShowChanged()
{
    if(ResOpt.AutoShowItems)
    {
        HideElementsWithoutResults(true);
    }
}


function ComputeSpectrumRange()
{
    var min = Number.MAX_VALUE;
    var max = -Number.MAX_VALUE;

    var nodesAreVisible = FEMOpt.Node;

    if(!IsNodalResult())
    {
        for(const e of FEM.Elements.Cards.values())
        {
                if(!e.IsVisible() || e.AttachedValue == NoResult) { continue; }
                if(e.AttachedValue > max) { max = e.AttachedValue; }
                if(e.AttachedValue < min) { min = e.AttachedValue; }
        }
    }
    else
    {
        for(const n of FEM.Nodes.Cards.values())
        {
            if(n.AttachedValue == undefined || n.AttachedValue == NoResult || !nodesAreVisible && n.AllElementsAreHidden()) { continue; }
            if(n.AttachedValue > max) { max = n.AttachedValue; }
            if(n.AttachedValue < min) { min = n.AttachedValue; }
        }
    }

    var hasChanged = Spectrum.Min != min || Spectrum.Max != max;
    return [min, max, hasChanged];
}

function IsResultsMode() { return FEMOpt.Mode == 'Results'; }

function UpdateResultsRange(bypassChecks = false)
{
    if(!bypassChecks && (!ResOpt.AutomaticRange || !IsResultsMode())) { return; }

    var [min, max, hasChanged] = ComputeSpectrumRange();
    if(!hasChanged) { return; }

    UpdateSpectrumRange(min, max);

    FEM.UpdateValuesAttribute(false, IsNodalResult());
}

function UpdateSpectrumRange(min, max)
{
    Spectrum.SetRange(min, max);
    MeshUniforms.min.value = min;
    MeshUniforms.max.value = max;
    WireframeUniforms.min.value = min;
    WireframeUniforms.max.value = max;
    ResOpt.Min = min;
    ResOpt.Max = max;
    MinRangeTextbox.updateDisplay();
    MaxRangeTextbox.updateDisplay();
    UpdateSpectrumView();
}

function AutomaticRangeChanged()
{
    if(ResOpt.AutomaticRange) 
    { 
        var [min, max, hasChanged] = ComputeSpectrumRange();
        if(hasChanged) 
        { 
            UpdateSpectrumRange(min, max);
            UpdateSpectrumColors();
        }
        return;
    }

    var update = false;
    if(!ResOpt.UseAboveMaxColor)
    {
        ResOpt.UseAboveMaxColor = true;
        UseAboveMaxColorCheckbox.updateDisplay();
        update = true;
    }

    if(!ResOpt.UseBelowMinColor)
    {
        ResOpt.UseBelowMinColor = true;
        UseBelowMinColorCheckbox.updateDisplay();
        update = true;
    }

    if(update)
    {
        SpectrumRangeChanged();
        UpdateSpectrumColors();
    }
}

function SpectrumRangeChanged()
{
    Spectrum.SetRange(ResOpt.Min, ResOpt.Max);

    MeshUniforms.min.value = ResOpt.Min;
    MeshUniforms.max.value = ResOpt.Max;
    WireframeUniforms.min.value = ResOpt.Min;
    WireframeUniforms.max.value = ResOpt.Max;
    UpdateSpectrumView();

    if(ResOpt.AutomaticRange)
    {
        ResOpt.AutomaticRange = false;
        AutomaticRangeChanged();
        AutomaticRangeCheckbox.updateDisplay();
    }

    FEM.UpdateValuesAttribute(false, IsNodalResult());
}

function UpdateSpectrumColors()
{
    Spectrum.Colors[0].FromArray(ResOpt.SpectrumColor1);
    Spectrum.Colors[1].FromArray(ResOpt.SpectrumColor2);
    Spectrum.Colors[2].FromArray(ResOpt.SpectrumColor3);
    Spectrum.Colors[3].FromArray(ResOpt.SpectrumColor4);
    Spectrum.Colors[4].FromArray(ResOpt.SpectrumColor5);
    Spectrum.NoneColor.FromArray(ResOpt.NoneColor);
    if(ResOpt.UseAboveMaxColor)
    {
        if(!Spectrum.AboveMaxColor) { Spectrum.AboveMaxColor = new FEXColor(); }
        Spectrum.AboveMaxColor.FromArray(ResOpt.AboveMaxColor);
    }
    else
    {
        Spectrum.AboveMaxColor = null;
    }
    if(ResOpt.UseBelowMinColor)
    {
        if(!Spectrum.BelowMinColor) { Spectrum.BelowMinColor = new FEXColor(); }
        Spectrum.BelowMinColor.FromArray(ResOpt.BelowMinColor);
    }
    else
    {
        Spectrum.BelowMinColor = null;
    }

    Spectrum.UpdateUniforms(MeshUniforms);
    FEM.UpdateValuesAttribute(false, IsNodalResult());
    UpdateSpectrumView();
}

var Spectrum;
var SpectrumCanvas;
function UpdateSpectrumView()
{
    document.getElementById('colorSpectrumHolder').style.display = 'initial';

    if(!SpectrumCanvas)
    {
        SpectrumCanvas = document.createElement('canvas');
        SpectrumCanvas.id = 'spectrumCanvas';
        SpectrumCanvas.height = 300;
        document.getElementById('colorSpectrumHolder').appendChild(SpectrumCanvas);
        SpectrumCanvas.width = 800;

    }

    // RenderSpectrumCanvas('white', 300, SpectrumCanvas);
    // RenderSpectrumCanvas('black', 300, SpectrumCanvas);
    RenderSpectrumCanvas();
}

function HideElementsWithoutResults(andShow = false)
{
    var nodal = IsNodalResult();
    var any = false;
    for(const [type, pack] of FEM.Packages.entries())
    {
        if(type == RenderableType.Node) { continue; }

        // console.log("HideElementsWithoutResults() " + type);
        var toHide = new Map();
        var toShow = new Map();
        for(var i = 0; i < pack.Items.length; i++)
        {
            var x = pack.Items[i];
            if(!x._IsVisible) 
            { 
                if(!nodal)
                {
                    if(x.AttachedValue != undefined && x.AttachedValue != NoResult)
                    {
                        toShow.set(x.ID, x);
                    }
                }
                else if(x.HasNodalResults())
                {
                    toShow.set(x.ID, x);
                }
                continue;
            }
            
            if(!nodal)
            {
                if(x.AttachedValue == undefined || x.AttachedValue == NoResult)
                {
                    toHide.set(x.ID, x);
                }
            }
            else if(!x.HasNodalResults())
            {
                toHide.set(x.ID, x);
            }
        }
        if(toHide.size > 0) { pack.Hide(toHide); any = true; }
        if(toShow.size > 0) { pack.Show(toShow); any = true; }
    }

    return any;
}


function AnimateChanged()
{
    // CurrentTime = 0;
    MeshUniforms.delta.value = 1.0;
    WireframeUniforms.delta.value = 1.0;
}

function AnimateColorsChanged()
{
    // CurrentTime = 0;
    MeshUniforms.colorDelta.value = 1.0;
    WireframeUniforms.colorDelta.value = 1.0;
}

function UpdateScale()
{
    if(!ResOpt.Deformed) { return; }
    let s = Math.log(parseFloat(ResOpt.Scale + 1));
    MeshUniforms.scale.value = s
    WireframeUniforms.scale.value = s;
    FEM.UpdateDisplacements();
}

var ResultCaseHasChanged = true;
function UpdateDeformed()
{
    let s = ResOpt.Deformed ?  Math.log(parseFloat(ResOpt.Scale + 1)) : 0;
    MeshUniforms.scale.value = s
    WireframeUniforms.scale.value = s;

    if(MeshUniforms.scale.value > 0 && ResultCaseHasChanged)
    {
        UpdateResults();
        ResultCaseHasChanged = false;
    }
}

var UndeformedMesh;
function DisplayUndeformed(state = true)
{
    if(ResOpt.Undeformed && state)
    {
        if(!UndeformedMesh)
        {
            UndeformedMesh = FEM.Packages.get(RenderableType.Element2D).Mesh.clone();
            UndeformedMesh.material = UndeformedMeshMaterial;
        }
        Scene.add(UndeformedMesh);
    }
    else if(UndeformedMesh)
    {
        Scene.remove(UndeformedMesh);
        UndeformedMesh = undefined; //do we need to do this?
    }
}

function CurrentSubcaseChanged()
{
    var subcase = Results.Subcases.get(parseInt(ResOpt.Subcase));
    
    if(CurrentModeCombobox) { ResultsGUI.remove(CurrentModeCombobox); CurrentModeCombobox = null; }
    if(subcase.ContainsModalData)
    {
        var modeLabels = [];
        for(const key of subcase.Modes.keys()) { modeLabels.push(key); }
        CurrentModeCombobox = ResultsGUI.add(ResOpt, 'Mode', modeLabels).onChange(UpdateSelectedResult);
        ResOpt.Mode = modeLabels[0];
        CurrentModeCombobox.updateDisplay();
    }
    UpdateSelectedResult();
}

function UpdateSelectedResult()
{
    if(!Results) { return; }

    UpdateResults();

    if(ResOpt.AutoShowItems)
    {
    //     if(HideElementsWithoutResults(true))
    //     {
    //         UpdateResultsRange(); //TODO find out why this sometimes freezes
    //     }
    }
}

function IsDisplacements() { return ResultsType[ResOpt.Result] == ResultsType.Displacements; }
function IsNodalResult() { var t = ResultsType[ResOpt.Result]; return t == ResultsType.Displacements || t == ResultsType.SPCForces || t == ResultsType.MPCForces; }
function IsElementalResult() { return !IsNodalResult(); }

function GetCurrentResultCase()
{
    var sc = Results.Subcases.get(parseInt(ResOpt.Subcase));
    return !sc.ContainsModalData ? sc : sc.Modes.get(parseInt(ResOpt.Mode));
}

var ModeEigenvalue = 0;
function UpdateResults(showIfHasResult = false)
{
    IsEnvelope = false;

    var resultCase = GetCurrentResultCase();
    if(!resultCase) { return; }
    var subcaseResults = resultCase.GetResults(ResultsType[ResOpt.Result]);
    if(!subcaseResults) { return; }

    ModeEigenvalue = resultCase.Eigenvalue;

    let showDisp = IsDisplacements();
    if(ResOpt.Deformed || showDisp)
    {
        if(resultCase.ContainsDisplacements)
        {
            var dispResults = showDisp ? subcaseResults : resultCase.GetResults(ResultsType.Displacements);
            PlotDisplacements(dispResults, ResOpt.Deformed, showDisp);
        }
        if(showDisp) { return; }
    }

    var min = Number.MAX_VALUE;
    var max = -Number.MAX_VALUE;
    var nodesAreVisible = FEMOpt.Node;

    if(IsElementalResult())
    {
        var component = TensorialComponent[Object.keys(TensorialComponent).find(k => k == ResOpt.TensorComponent)];
        var fetching = FetchingType[Object.keys(FetchingType).find(k => k == ResOpt.Layer)];

        for(const [k, e] of FEM.Elements.Cards.entries())
        {
            var r = subcaseResults.get(k);
            if(r && r.Values.length > 0)
            {
                let v = r.GetValue(component, fetching);
                e.AttachedValue = v; e.AttachedResult = r;
                if(e.IsVisible()) { if(min > v) { min = v; }; if(max < v) { max = v; }; }
            }
            else { e.AttachedValue = NoResult; e.AttachedResult = undefined; }
        }
    }
    else
    {
        var component = VectorialComponent[Object.keys(VectorialComponent).find(k => k == ResOpt.VectorComponent)];
        for(const [k, n] of FEM.Nodes.Cards.entries())
        {
            var r = subcaseResults.get(k);
            if(r && r.Values.length > 0)
            {
                let v = r.Values[0].GetVector(VectorialComponent.Magnitude);
                n.AttachedValue = v; n.AttachedResult = r;
                if(nodesAreVisible && !n.AllElementsAreHidden()) { if(min > v) { min = v; }; if(max < v) { max = v; }; }
            }
            else { n.AttachedValue = NoResult; n.AttachedResult = undefined; }
        }
    }

    if(ResOpt.AutomaticRange) { UpdateSpectrumRange(min, max); }
    FEM.UpdateValuesAttribute(false, IsNodalResult());
}

function PlotDisplacements(subcaseResults, disp = true, color = false)
{
    var min = Number.MAX_VALUE;
    var max = -Number.MAX_VALUE;
    var nodesAreVisible = FEMOpt.Node;

    var component = VectorialComponent[Object.keys(VectorialComponent).find(k => k == ResOpt.VectorComponent)];

    for(const [k, n] of FEM.Nodes.Cards.entries())
    {
        var r = subcaseResults.get(k);
        if(r && r.Values.length > 0)
        {
            let v = r.Values[0].GetVector(VectorialComponent.Magnitude);
            n.SetDisp(v); n._Disp.Keep(component);
            let val = n._Disp.Magnitude();  n.AttachedValue = val;
            if(color || nodesAreVisible && !n.AllElementsAreHidden()) { if(min > val) { min = val; }; if(max < val) { max = val; }; }
        }
        else { n.AttachedValue = NoResult; n.AttachedResult == undefined; }
    }
    
    if(color)
    {
        if(ResOpt.AutomaticRange) { UpdateSpectrumRange(min, max); }
        FEM.UpdateValuesAttribute(false, true);
    }

    FEM.UpdateDisplacements();
}

function UpdateFEMColor()
{
    if(!FEM || FEM.RenderMode != RenderMode.Standard) { return; }
    FEM.SetStandardColor();
}

function UpdateFEMOpacity() 
{ 
    if(!FEM) { return; }

    for(const [key, pack] of FEM.Packages.entries())
    {
        pack.SetOpacity(FEMOpt.Opacity);
    }
}

function GetRenderMode() { return RenderMode[Object.keys(RenderMode).find(k => k === FEMOpt.Mode)]; }

function RenderModeChanged()
{
    if(!FEM) { return; }

    var m = GetRenderMode();
    if(m != RenderMode.Results) 
    {
        if(m == RenderMode.Custom)
        {
            CustomModeTextbox = MainGUI.add(FEMOpt, 'CustomModeString').name('Custom Mode').onChange(CustomModeChanged);
        }
        else
        {
            if(CustomModeTextbox) { MainGUI.remove(CustomModeTextbox); CustomModeTextbox = undefined; }
        }

        if(m == RenderMode.Standard)
        {
            ShowSpectrum(false);
        }
        MeshUniforms.valueFlag.value = 0.0;
        WireframeUniforms.valueFlag.value = 0.0;
        ShowResultsGUI(false);
        DisplayUndeformed(false);
    }
    else if(Results)
    {
        MeshUniforms.valueFlag.value = 1.0;
        WireframeUniforms.valueFlag.value = 1.0;
        UpdateSelectedResult();
        ShowSpectrum(true);
        ShowResultsGUI(true);
        DisplayUndeformed(true);
    }
    FEM.SetRenderMode(m);
}

function UpdateNodesVisibility() { if(FEM) { TogglePack(RenderableType.Node); } }
function UpdateElements0DVisibility() { if(FEM) { TogglePack(RenderableType.Element0D); } }
function UpdateElements1DVisibility() { if(FEM) { TogglePack(RenderableType.Element1D); } }
function UpdateElements2DVisibility() { if(FEM) { TogglePack(RenderableType.Element2D); } }
function UpdateElements3DVisibility() { if(FEM) { TogglePack(RenderableType.Element3D); } }
function UpdateMPCsVisibility() { if(FEM) { TogglePack(RenderableType.MPC); } }
function UpdateConnectorsVisibility() { if(FEM) { TogglePack(RenderableType.Connector); } }
function UpdateWireframeVisibility() 
{ 
    if(FEM) 
    {
        let vis = FEMOpt.Wireframe;
        for(const pack of FEM.Packages.values())
        {
            if(pack.Wireframe)
            {
                if(vis) { Scene.add(pack.Wireframe); }
                else { Scene.remove(pack.Wireframe); }
            }
        }
    }
}

function GetRenderablePackageVisibility(t) { return FEMOpt[Object.keys(RenderableType).find(k => RenderableType[k] === t)]; }
function TogglePack(type) 
{ 
    if(GetRenderablePackageVisibility(type)) 
    { 
        ShowPack(FEM.Packages.get(type)); 
    } 
    else 
    { 
        HidePack(FEM.Packages.get(type)); 
    } 
    UpdateResultsRange();
}

function HidePack(p) 
{ 
    p.IsVisible = false; 
    if(p.Mesh) { Scene.remove(p.Mesh); }
    if(p.Wireframe) { Scene.remove(p.Wireframe); }
    if(p.Lines) { Scene.remove(p.Lines); }
    if(p.Points) { Scene.remove(p.Points); }
}
function ShowPack(p)
{ 
    p.IsVisible = true; 
    AddPackageToScene(p);
    if(p.Mesh) { Scene.add(p.Mesh); }
    if(p.Wireframe) { Scene.add(p.Wireframe); }
    if(p.Lines) { Scene.add(p.Lines); }
    if(p.Points) { Scene.add(p.Points); }
}

function ShowLabelsFEM()
{
    if(FEM)
    {
        for(const pack of FEM.Packages.values()) 
        {
            if(FEMOpt.ShowLabels && pack.IsVisible)
            {
                pack.ShowLabels(true);
                if(!pack.Labels)
                {
                    pack.Labels = new THREE.Mesh(pack.LabelGeometry, LabelMaterial);
                    pack.Labels.renderOrder = 4;
                    pack.Labels.frustumCulled = false; 
                }
                Scene.add(pack.Labels);
            }
            else
            {
                Scene.remove(pack.Labels);
            }
        }
    }
}

var InitialZoom;
var ModelSize;
var ZoomIndependentSize;
var FEMLoaded = false;

function AddPackageToScene(pack)
{
    pack.IsVisible = true;
    if(pack.MeshGeometry) { InitMesh(pack); }
    if(pack.LineGeometry) { InitLines(pack); }
    if(pack.PointGeometry) { InitPoints(pack); }
}

function InitMesh(pack)
{
    if(pack.Mesh) { return; }
    pack.Mesh = new THREE.Mesh(pack.MeshGeometry, MeshMaterial);
    pack.Mesh.renderOrder = 0;
    Scene.add(pack.Mesh);
    
    pack.Wireframe = new THREE.LineSegments(pack.WireframeGeometry, WireframeMaterial);
    // pack.Wireframe.renderOrder = 41;
    Scene.add(pack.Wireframe);
}

function InitLines(pack)
{
    pack.Lines = new THREE.LineSegments(pack.LineGeometry, MeshMaterial);
    pack.Lines.renderOrder = 2;
    Scene.add(pack.Lines);
}

function InitPoints(pack)
{
    pack.Points = new THREE.Points(pack.PointGeometry, MeshMaterial);
    Scene.add(pack.Points);
}

function LoadModel(fileOrUrl)
{
    HideIntroText();

    let reader = new FEMReader(fileOrUrl, ShowLoading, function(fem) 
    {
        FEM = fem;
        FEM.BuildGeometry();

        for(const pack of FEM.Packages.values())
        {
            if(!GetRenderablePackageVisibility(pack.Type)) { continue; }
            AddPackageToScene(pack);
        }

        if(FEMOpt.ShowLabels) { ShowLabelsFEM(); }

        Scene.add(SelectedMesh);
        Scene.add(HoverMesh);
        Scene.add(HoverLines);
        // Scene.add(HoverPoints);
        Scene.add(SelectionLines);

        FitToView();
        ShowLoading(false);

        FEMLoaded = true;
   });
}

function LoadOP2(file)
{
    HideIntroText();

    let reader = new OP2Reader(file, ShowLoading,  function(fem) 
    {
        FEM = fem;
        FEM.BuildGeometry();

        for(const pack of FEM.Packages.values())
        {
            if(!GetRenderablePackageVisibility(pack.Type)) { continue; }
            AddPackageToScene(pack);
        }

        if(FEMOpt.ShowLabels) { ShowLabelsFEM(); }

        Scene.add(SelectedMesh);
        Scene.add(HoverMesh);
        Scene.add(HoverLines);
        // Scene.add(HoverPoints);
        Scene.add(SelectionLines);
 
        FitToView();
        ShowLoading(false);

        FEMLoaded = true;
    }, function(results)
    {
        Results = results;
        AddResultsGUI(Results.Subcases);
    });
}

function FitToView() 
{
    var position = FEM.BoundingBox.max.clone();
    position.x = position.x + 100;
    position.y = position.y + 30;
    Camera.position.copy(position)

    var center = new THREE.Vector3();
    FEM.BoundingBox.getCenter(center);
    Controls.target.copy(center);

    var size = new THREE.Vector3();
    FEM.BoundingBox.getSize(size);
    ModelSize = Math.max(size.x, Math.max(size.y, size.z));

    console.log("ModelSize is " + ModelSize);

    Camera.zoom = Math.min(window.innerWidth / size.x, 0.75 * window.innerHeight / size.y) * 0.0025;

    Camera.updateProjectionMatrix();   
    Camera.updateMatrix();

    InitialZoom = Camera.zoom;
}; 

function OnMouseUp(event)
 {
    if(IsRecording) { return; }

    MousePos.x = ((event.clientX - Renderer.domElement.offsetLeft) / Renderer.domElement.width) * 2 - 1;
    MousePos.y = -((event.clientY - Renderer.domElement.offsetTop) / Renderer.domElement.height) * 2 + 1;

    if(event.ctrlKey) //Set target
    {
        var intersects = Raycaster.intersectObjects( Scene.children);
        if(intersects.length == 0) { return; }
        var intersect = intersects[0].point;
        Controls.target.copy(intersect);
        return;
    }

    var add = event.button == 0;
    var remove = event.button == 2;

    if(!add && !remove) { return; }

    if(remove) { return; } //temp

    if(SelOpt.SelectionEnabled)
    {
        if(add && !event.shiftKey && !SelOpt.StickySelection)
        {
            StartGeometryChange(SelectionGeometry);
            SelectionManager.ClearSelected();
        }

        var toSelect;
        if(SelOpt.HoverEnabled && SelectionManager.Hovered)
        {
            toSelect = SelectionManager.Hovered;
        }
        else
        {
            toSelect = GetSelectionUnderMouse();
        }

        if(toSelect)
        {
            if(event.altKey)
            {
                var extended = toSelect.Extend(FEMCardType.ELEMENT, false, null, null, true);

                for(var i = 0; i < extended.length; i++)
                {
                    SelectionManager.AddSelected(extended[i], add);
                }


                FacesFromRenderables(SelectionGeometry, extended); //TODO FIX
                // EndGeometryChange(SelectionGeometry);
            }
            else
            {
                SelectionManager.AddSelected(toSelect, add);
                // StartGeometryChange(SelectionGeometry);
                FacesFromRenderable(SelectionGeometry, toSelect); //TODO FIX
            }
        }

        EndGeometryChange(SelectionGeometry);
    }
}

function GetSelectionUnderMouse()
{
    return GetObjectUnderMouse();
}

function SetRendererSize(width, height)
{
    let aspect = height / width;
    
    let frustumSize = 5;
    Camera.left = frustumSize / - 2;
    Camera.right = frustumSize / 2;
    Camera.top = frustumSize * aspect / 2;
    Camera.bottom = - frustumSize * aspect / 2;
    
    Camera.updateProjectionMatrix();
    Renderer.setSize(width, height);
}
//
function OnMouseMove(event) 
{
    if(IsRecording) { return; }

    event.preventDefault();
    MousePos.x = ((event.clientX - Renderer.domElement.offsetLeft) / Renderer.domElement.width) * 2 - 1;
    MousePos.y = -((event.clientY - Renderer.domElement.offsetTop) / Renderer.domElement.height) * 2 + 1;  

    if(!FEM) { return; }

    if(SelOpt.HoverEnabled && !ControlsAreMoving())
    {
        var x = GetObjectUnderMouse();
        if(x != null)
        {
            if(SelectionManager.Hovered === x) { return; }
            SelectionManager.SetHovered(x);

            if(x.GetRenderableType() != RenderableType.Node)
            {
                StartGeometryChange(HoverGeometry);
                FacesFromRenderable(HoverGeometry, x);
                EndGeometryChange(HoverGeometry);

                ShowHoverLabel();
                HoverLabel.UpdatePosition(x.GetCentroid());

                var html = "<h3>" + x.ID + "</h3>";
                if(x.AttachedValue != undefined && x.AttachedValue != NoResult)
                {
                    html += "<p>" + x.AttachedValue.toExponential(5) + "</p>";
                }
                HoverLabel.SetHtml(html);


                StartGeometryChange(HoverLineGeometry);
                LinesFromRenderable(HoverLineGeometry, x);
                EndGeometryChange(HoverLineGeometry);
            }
            else
            {
                // var p = x.Pos();;
                // HoverPointGeometry.attributes.position.array[0] = p.X;
                // HoverPointGeometry.attributes.position.array[1] = p.Y;
                // HoverPointGeometry.attributes.position.array[2] = p.Z;
                // HoverPointGeometry.attributes.position.needsUpdate = true;
                // HoverPointGeometry.setDrawRange(0, 1);

            }
            return;
        }
        else
        {
            ShowHoverLabel(false);
        }
        // HoverPointGeometry.setDrawRange(0, 0);
    }

    SelectionManager.SetHovered(null)
    StartGeometryChange(HoverGeometry);
    EndGeometryChange(HoverGeometry);
    
    StartGeometryChange(HoverLineGeometry);
    EndGeometryChange(HoverLineGeometry);

    StartGeometryChange(HoverPointGeometry);
    EndGeometryChange(HoverPointGeometry);
}

function GetObjectUnderMouse()
{
    if(!FEM) { return; }

    let intersections = [];
    for(const [key, pack] of FEM.Packages.entries())
    {
        if(!FilterAccepts(key)) { continue; }
        if(!pack.IsVisible) { continue; }
        if(key == RenderableType.Node)
        {
            // if(pack.PointsBVH)
            // {
            //     var intersects = pack.PointsBVH.intersectRay(Raycaster, pack.Points);
            //     for(var i = 0; i < intersects.length; i++)
            //     {
            //         var index = intersects[i].index;
            //         var n = pack.GetObjectByPointIndex(index);
            //         intersections.push({ object: n, sqDistance: intersects[i].sqDistance });                   
            //     }
            // }
        }
        else
        {
            if(pack.MeshBVH)
            {
                var intersects = pack.MeshBVH.intersectRay(Raycaster, pack.Mesh);
                for(var i = 0; i < intersects.length; i++)
                {
                    var index = intersects[i].index;
                    var e = pack.GetObjectByTriangleIndex(index);
                    if(!e.IsVisible()) { continue; }
                    intersections.push({ object: e, sqDistance: intersects[i].sqDistance });
                }
            }

            if(pack.PointsBVH)
            {


            }
        }
    }

    if(intersections.length > 0)
    {
        intersections.sort((a, b) => { return  a.sqDistance - b.sqDistance; } );
        return intersections[0].object;
    }
    return null;
}

function FilterAccepts(type)
{
    if(SelOpt.Element2D && type == RenderableType.Element2D) { return true; }
    else if(SelOpt.Element1D && type == RenderableType.Element1D) { return true; }
    else if(SelOpt.Element3D && type == RenderableType.Element3D) { return true; }
    else if(SelOpt.Element0D && type == RenderableType.Element0D) { return true; }
    else if(SelOpt.Node && type == RenderableType.Node) { return true; }
    return false;
}

function OnKeyUp(event)
{
    const key = event.key;

    if(key === "Delete")
    {
        for(const[type, selected] of SelectionManager.Selected.entries())
        {
            if(selected.size == 0) { continue; }
            var pack = FEM.Packages.get(type);
            if(pack)
            {
                pack.Hide(selected);
            }
        }

        UpdateResultsRange();

        StartGeometryChange(SelectionGeometry);
        SelectionManager.ClearSelected();
        EndGeometryChange(SelectionGeometry);

        StartGeometryChange(HoverGeometry);
        EndGeometryChange(HoverGeometry);
    }
    else if(key === "Enter")
    {
        for(const pack of FEM.Packages.values())
        {
            if(!pack.IsVisible) { continue; }
            pack.ShowAll();
        }

        UpdateResultsRange();

    }
    else if(key === "Escape")
    {
        if(IsRecording) { StopRecording(); }
    }
}


//Console:
Console = new Console({ handleCommand: handle_command, placeholder: "Enter Command", storageID: "FEMStudioLog"});
document.getElementById('consoleHolder').appendChild(Console.element);

function handle_command(command)
{
	var err;
    try
    {
	    var result = eval(command);
    }
    catch(error)
    {
	    err = error;
    }

    if(err)
    {
	    Console.error(err);
    }
    else
    {
        Console.log(result).classList.add("result");
    }
};

Console.info("Welcome to FEM Studio!");
Console.warn("Copyright Timur Vizaev 2024");


//Misc
function CreateTextLabel() 
{
    var div = document.createElement('div');
    div.className = 'text-label';
    div.style.position = 'absolute';
    div.style.width = 100;
    div.style.height = 100;
    div.style.pointerEvents = 'none';
    div.innerHTML = "";
    div.style.top = -1000;
    div.style.left = -1000;
    
    return {
      element: div,
      parent: false,
      SetHtml: function(html) 
      {
        this.element.innerHTML = html;
      },
      UpdatePosition: function(v) 
      {
        this.position =  new THREE.Vector3(v.X,v.Y,v.Z);
        var coords2d = this.get2DCoords(this.position, Camera);
        this.element.style.left = coords2d.x + 'px';
        this.element.style.top = (coords2d.y - 50) + 'px';
      },
      get2DCoords: function(position, camera) {
        var vector = position.project(camera);
        vector.x = (vector.x + 1)/2 * window.innerWidth;
        vector.y = -(vector.y - 1)/2 * window.innerHeight;
        return vector;
      }
    };
}

function SetBackground()
{
    let style = ViewOpt.Style === 'radial' ? 
    'radial-gradient('+ ViewOpt.Color1 + ',' + ViewOpt.Color2 + ')' : 
    'linear-gradient(' + ViewOpt.Style + ',' + ViewOpt.Color1 + ',' + ViewOpt.Color2 + ')';
    container.style.background = style;
}

function ShowLoading(state = true) { document.getElementById('loading-wrapper').style.display = state ? 'initial' : 'none'; }
function ShowSpectrum(state = true) { document.getElementById('colorSpectrumHolder').style.display = state ? 'initial' : 'none'; }
function ShowResultsGUI(state = true) { if(ResultsGUI) { ResultsGUI.domElement.style.display = state ? '' : 'none'; } }

function ForeachController(f) { for (var c in dat.controllers) { if (dat.controllers.hasOwnProperty(c)) { f(dat.controllers[c]); } } }
function SetControllerTooltip(v) { if (v) { this.__li.setAttribute('title', v); } else { this.__li.removeAttribute('title'); } return this; };
function EnableGUITooltips() { ForeachController(function(c) { if (!c.prototype.hasOwnProperty('title')) { c.prototype.tooltip = SetControllerTooltip; } }); }

//For BVH testing purposes:

var modelObject;
var intersectingTriangles;
var rayLines;
var bvhNodeLines;
var triCount = 0;

function drawBVHNodeExtents(rootNode) 
{
    var bvhNodeMat = new THREE.LineBasicMaterial({ color: 0x0f00ff, transparent: true, opacity: 0.4});
    bvhNodeLines = new THREE.LineSegments(new THREE.Geometry(), bvhNodeMat);
    bvhNodeLines.geometry.dynamic = true;
    bvhNodeLines.frustumCulled = false;

    var nodesToVisit = [];
    nodesToVisit.push(rootNode);

    while (nodesToVisit.length > 0) {
        var bvhNode = nodesToVisit.pop();

        var elemsInNode = bvhNode._endIndex - bvhNode._startIndex;
        triCount += elemsInNode;

        // if (elemsInNode !== 0) 
        if (!bvhNode._node0 && !bvhNode._node1)
        {
            // console.log("elements in node: ", elemsInNode);

            var min = bvhNode._extentsMin;
            var max = bvhNode._extentsMax;
            var width = max.x - min.x;
            var height = max.y - min.y;
            var depth = max.z - min.z;

            var v0 = new THREE.Vector3(min.x, min.y, min.z);
            var v1 = new THREE.Vector3(min.x + width, min.y, min.z);
            var v2 = new THREE.Vector3(min.x + width, min.y + height, min.z);
            var v3 = new THREE.Vector3(min.x, min.y + height, min.z);

            var v4 = new THREE.Vector3(min.x, min.y, max.z);
            var v5 = new THREE.Vector3(min.x + width, min.y, max.z);
            var v6 = new THREE.Vector3(min.x + width, min.y + height, max.z);
            var v7 = new THREE.Vector3(min.x, min.y + height, max.z);

            bvhNodeLines.geometry.vertices.push(v0, v1);
            bvhNodeLines.geometry.vertices.push(v1, v2);
            bvhNodeLines.geometry.vertices.push(v2, v3);
            bvhNodeLines.geometry.vertices.push(v3, v0);

            bvhNodeLines.geometry.vertices.push(v4, v5);
            bvhNodeLines.geometry.vertices.push(v5, v6);
            bvhNodeLines.geometry.vertices.push(v6, v7);
            bvhNodeLines.geometry.vertices.push(v7, v4);

            bvhNodeLines.geometry.vertices.push(v0, v4);
            bvhNodeLines.geometry.vertices.push(v1, v5);
            bvhNodeLines.geometry.vertices.push(v2, v6);
            bvhNodeLines.geometry.vertices.push(v3, v7);
        }

        // recursively draw child nodes
        if (bvhNode._node0 !== null) { nodesToVisit.push(bvhNode._node0); }
        if (bvhNode._node1 !== null) { nodesToVisit.push(bvhNode._node1); }
    }

    Scene.add(bvhNodeLines);
}

document.getElementById('loadTestModelButton').addEventListener('click', function() 
{
    Console.log("Loading test model...")
    LoadModel("static/test.bdf")
});

function HideIntroText()
{   
    const titleWrapper = document.querySelector('.title-wrapper');
    titleWrapper.classList.add('hidden');
}
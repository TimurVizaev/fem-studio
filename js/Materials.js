//Copyright Timur Vizaev 2014-2024
//
//FEM Studio

var MeshUniforms = 
{
    valueFlag: { value: 0.0 },
    delta: { value: 1.0},
    scale: { value: 1.0},
    colorDelta: { value: 1.0},
    min: { value: 0.0 },
    max: { value: 100.0 },
    colors:
    {
        value: [0.0, 0.0, 0.0]
    },
    colorsLength: { value : 5 },
    noneColor:  { value: new THREE.Vector3(0.0, 0.0, 0.0) },
    belowMinColor:  { value: new THREE.Vector3(0.0, 0.0, 0.0) },
    aboveMaxColor:  { value: new THREE.Vector3(0.0, 0.0, 0.0) },
    hide: { value: 0.0 },
    nodeSize: { value: 2.0 },
    nodeSizeDynamic: { value: 0.0 },
    minNodeSize: { value: 1.0 },
    maxNodeSize: { value: 10.0 },
};

var WireframeUniforms =
{
    valueFlag: { value: 0.0 },
    delta: { value: 1.0 },
    scale: { value: 1.0 },
    colorDelta: { value: 1.0},
    color: { value: [0.0, 0.0, 0.0] },
    min: { value: 0.0 },
    max: { value: 100.0 },
    hide: { value: 0.0 },
}

var LabelUniforms = 
{
    map : { type: "t", value: FontTexture },
    scale : { value: 1.0 },
};


const MeshVertexShader = `  
uniform float delta;    
uniform float scale;
uniform float valueFlag;

uniform float min;     
uniform float max; 

uniform float nodeSize;
uniform float nodeSizeDynamic;
uniform float minNodeSize;
uniform float maxNodeSize;

attribute float opacity;
attribute vec3 color;
attribute vec3 displacement;
attribute float value;

varying float vOpacity;
varying vec3 vColor;
varying float vValue;

void main() 
{
    vColor = color;
    vOpacity = opacity;
    vValue = value;

    float def = valueFlag > 0.0 ? scale * delta : 0.0;
    vec3 dispPos = position + def * displacement;
    vec4 worldPos = modelViewMatrix * vec4(dispPos, 1.0);
    vec4 eyePos = projectionMatrix * worldPos;
    gl_Position = eyePos;

    if(nodeSizeDynamic > 0.0)
    {
        float m = value / (max - min);
        float s = delta * (minNodeSize + m * (maxNodeSize - minNodeSize));
        gl_PointSize = valueFlag > 0.0 ? s : nodeSize;
    }
    else
    {
        gl_PointSize = nodeSize;
    }
}
`

const MeshFragmentShader = `  
uniform float delta;     
uniform float colorDelta; 

uniform float min;     
uniform float max; 

uniform vec3 colors[10];  
uniform int colorsLength;
uniform vec3 noneColor;
uniform vec3 aboveMaxColor;
uniform vec3 belowMinColor;

uniform float valueFlag;
uniform float hide;

varying float vOpacity;
varying vec3 vColor;
varying float vValue;

vec3 GetColorData(int _i)
{
    if(_i == 0) { return colors[0]; }
    if(_i == 1) { return colors[1]; }
    if(_i == 2) { return colors[2]; }
    if(_i == 3) { return colors[3]; }
    if(_i == 4) { return colors[4]; }
    if(_i == 5) { return colors[5]; }
    if(_i == 6) { return colors[6]; }
    if(_i == 7) { return colors[7]; }
    if(_i == 8) { return colors[8]; }
    if(_i == 9) { return colors[9]; }
}

vec3 GetColor(float v)
{
    if(vValue == -1.0e10) { return noneColor; }

    if(v > max) { return aboveMaxColor; }
    if(v < min) { return belowMinColor; }

    float range = max - min;
    float step = range / float(colorsLength - 1);
    int colorIndex = int(floor(v - min) / step);
    if(colorIndex < 0) { colorIndex = 0; }
    if(colorIndex > colorsLength - 2) { colorIndex = colorsLength - 2; }

    vec3 c0 = GetColorData(colorIndex);
    vec3 c1 = GetColorData(colorIndex + 1);

    float m = (v - min) / step - float(colorIndex);
    return mix(c0, c1, m);
}

void main() 
{
    if(valueFlag > 0.0) 
    { 
        float v = colorDelta * vValue;
        if(hide > 0.0) { if(v > max || v < min) { discard; } }

        if (vOpacity > 0.0) { gl_FragColor = vec4(GetColor(v), vOpacity); } else { discard; }
    }
    else
    {
        if (vOpacity > 0.0) { gl_FragColor = vec4(vColor, vOpacity); } else { discard; }
    }

}
`

const WireframeVertexShader = `  
uniform float delta;    
uniform float scale;  
uniform float valueFlag;

attribute float opacity;
attribute vec3 displacement;
attribute float value;

varying float vOpacity;
varying float vValue;

void main() 
{
    vOpacity = opacity;
    vValue = value;
    float def = valueFlag > 0.0 ? scale * delta : 0.0;
    vec3 p = position + def * displacement;
    vec4 projP = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    // projP.z -= 0.000001;
    projP.z -= 0.00001;
    gl_Position = projP;
}
`

const WireframeFragmentShader = `  
uniform vec3 color;  
uniform float colorDelta; 

uniform float valueFlag;
uniform float min;     
uniform float max; 
uniform float hide;

varying float vOpacity;
varying float vValue;

void main()
{
    // if(vValue > 10.0) { discard; }
    // else { gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); }

    if(valueFlag > 0.0) 
    { 
        float v = colorDelta * vValue;
        if(hide > 0.0) { if(v > max || v < min) { discard; } }

        if (vOpacity > 0.0) { gl_FragColor = vec4(color, vOpacity); } else { discard; }
    }
    else
    {
        if (vOpacity > 0.0) { gl_FragColor = vec4(color, vOpacity); } else { discard; }
    }
}
`

const LabelVertexShader = `  
uniform sampler2D map;
uniform float scale;

attribute float opacity;
attribute vec3 centroid;
attribute vec2 offset;
attribute float elemSize;

varying vec2 vUv;
varying float vOpacity;

void main() 
{
    //Scaling label
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float size = 1.0;

    vec4 testCorner1 = projectionMatrix * modelViewMatrix * vec4(centroid + right * 1.0 * size + up * 1.0* size, 1.0);  
    vec4 testCorner2 = projectionMatrix * modelViewMatrix * vec4(centroid + 2.0 * right * 1.0 * size + 2.0 * up *1.0 * size, 1.0);  
    float screenSpaceSize = distance(testCorner1.x, testCorner2.x) * 1000.0;

    float factor = 1.0;
    float constantSizeFactor = 20.0 / screenSpaceSize;
    bool constantSize = false;

    if(screenSpaceSize > 30.0)
    {
        constantSize = true;
    }

    if(!constantSize)
    {
        factor = 0.02 * elemSize * scale;

        if(factor > constantSizeFactor) { constantSize = true; }
    }

    if(constantSize) { factor = constantSizeFactor; }

    vec4 vertexPos = projectionMatrix * modelViewMatrix * vec4(centroid + right * offset.x * factor + up * offset.y * factor, 1.0);  
    vertexPos.z -= 0.00004 * elemSize;

    gl_Position = vertexPos;

     //Constant size label
    //  vec4 centroidPos = projectionMatrix* modelViewMatrix * vec4(centroid, 1.0);
    //  centroidPos.xy += 0.03 * offset.xy;
    //  gl_Position = centroidPos; //Constant size label
    //  return;


    float factorRatio = factor / constantSizeFactor;
    vOpacity = opacity;
    vOpacity *= factorRatio;
    vUv = uv;
}
`

const LabelFragmentShader = `  

uniform sampler2D map;

varying vec2 vUv;
varying float vOpacity;

void main() 
{
    
    if (vOpacity > 0.4) 
    {
        vec4 c = texture2D(map, vUv);
        if(c.r > 0.6)
        {
            c.a = 0.5;
        }
        c.a *= vOpacity;
        gl_FragColor = c;

        
    } 
    else { discard; }
}
`

const UndeformedMeshVertexShader = `  
attribute float opacity;
attribute vec3 color;

varying float vOpacity;
varying vec3 vColor;

void main() 
{
    vColor = color;
    vOpacity = opacity;

    vec3 dispPos = position;
    vec4 worldPos = modelViewMatrix * vec4(dispPos, 1.0);
    vec4 eyePos = projectionMatrix * worldPos;
    eyePos.z -= 0.00001;
    gl_Position = eyePos;
}
`

const UndeformedMeshFragmentShader = `  
varying float vOpacity;
varying vec3 vColor;

void main() 
{
    if (vOpacity > 0.0) { gl_FragColor = vec4(0.9, 0.9, 0.9, 0.7); } else { discard; }
}
`


var LabelMaterial = new THREE.ShaderMaterial({
    uniforms : LabelUniforms,
    vertexShader : LabelVertexShader,
    fragmentShader : LabelFragmentShader,
    transparent : true,
    depthTest : true
});


var MeshMaterial = new THREE.ShaderMaterial( 
    {
        uniforms: MeshUniforms,
        vertexShader: MeshVertexShader,
        fragmentShader: MeshFragmentShader,
        // depthTest: false,
        transparent: true,
        // depthWrite: false,
        side: THREE.DoubleSide
    });

var WireframeMaterial = new THREE.ShaderMaterial( 
    {
        uniforms: WireframeUniforms,
        vertexShader: WireframeVertexShader,
        fragmentShader: WireframeFragmentShader,
        // depthTest: false,
        transparent: true,
        // depthWrite: false,
        side: THREE.DoubleSide,
    });

var SelectionLineMaterial = new THREE.MeshBasicMaterial (
    { color: 0xff00ff, opacity: 0.8, depthTest: false, depthWrite: true, transparent: true, side: THREE.DoubleSide, 
        polygonOffset : true, polygonOffsetFactor: -1 });
 
var HoverLineMaterial = new THREE.MeshBasicMaterial ({ color: 0xff0000, opacity: 0.8, depthTest: false, depthWrite: true, transparent: true, side: THREE.DoubleSide,
    polygonOffset : true, polygonOffsetFactor: -1 });

var HoverPointMaterial = new THREE.PointsMaterial( { color: 0x88ff88, size : 10, depthTest: false, depthWrite: true, transparent: true });


var UndeformedMeshMaterial = new THREE.ShaderMaterial( 
    {
        vertexShader: UndeformedMeshVertexShader,
        fragmentShader: UndeformedMeshFragmentShader,
        // depthTest: false,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });

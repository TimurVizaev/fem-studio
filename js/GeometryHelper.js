//Copyright Timur Vizaev 2014-2024
//
//FEM Studio

function StartGeometryChange(geom)
{
    geom.vertices = [];
    geom.faces = [];
}

function EndGeometryChange(geom)
{
    geom.elementsNeedUpdate = true;
    geom.verticesNeedUpdate = true;
}

function FacesFromRenderablesMap(geom, elements)
{
    for (const elem of elements.values())
    {
        FacesFromRenderable(geom, elem);
    }
}

function FacesFromRenderables(geom, elements)
{
    for(var i = 0; i < elements.length; i++)
    {
        FacesFromRenderable(geom, elements[i]);
    }
}

function FacesFromRenderable(geom, elem)
{
    var pos = geom.vertices.length;

    var points = elem.GetPoints();
    var triangles = elem.GetTriangles(elem.IsQuadratic());

    if(triangles.length == 0) { return; }

    for(var i = 0; i < points.length; i++)
    {
        var p = points[i];
        geom.vertices.push(new THREE.Vector3(p.X, p.Y, p.Z));
    }
    
    for(var i = 0; i < triangles.length; i++)
    {
        geom.faces.push(new THREE.Face3(triangles[i][0] + pos, triangles[i][1] + pos, triangles[i][2] + pos));
    }
}

function LinesFromRenderables(geom, elements)
{
    for (const elem of elements.values())
    {
        LinesFromRenderable(geom, elem);
    }
}

function LinesFromRenderable(geom, elem)
{
    var pos = geom.vertices.length;

    var points = elem.GetPoints();
    var lines = elem.GetLines();

    if(lines.length == 0) { return; }

    for(var i = 0; i < points.length; i++)
    {
        var p = points[i];
        geom.vertices.push(new THREE.Vector3(p.X, p.Y, p.Z));
    }
    
    // for(var i = 0; i < lines.length; i++)
    // {
    //     geom.indices.push(lines[i][0] + pos, lines[i][1] + pos);
    // }
}

function PointsFromRenderables(geom, elements)
{
    for (const elem of elements.values())
    {
        PointsFromRenderable(geom, elem);
    }
}

function PointsFromRenderable(geom, elem)
{
    var pos = geom.vertices.length;

    var points = elem.GetPoints();

    for(var i = 0; i < points.length; i++)
    {
        var p = points[i];
        geom.vertices.push(new THREE.Vector3(p.X, p.Y, p.Z));
        // geom.indices.push(pos + i);
    }
}

//Copyright Timur Vizaev 2014-2024
//
//FEM Studio

var bvhtree = bvhtree || {};


bvhtree.BVH = function(coordsArray, vertPerElem, eps) 
{
    this.VerticesPerElement = vertPerElem;
    this.CoordsPerItem = vertPerElem * 3;
    var elemCount = coordsArray.length / this.CoordsPerItem;
    this.Epsilon = eps || 10e-6;

    this._coordsArray = coordsArray;
    this._maxElementsPerNode = 7;
    this._bboxArray = this.calcBoundingBoxes(coordsArray);

    // clone a helper array
    this._bboxHelper = new Float32Array(this._bboxArray.length);
    this._bboxHelper.set(this._bboxArray);

    // create the root node, add all the triangles to it
    var extents = this.calcExtents(0, elemCount, this.Epsilon);
    this._rootNode = new bvhtree.BVHNode(extents[0], extents[1], 0, elemCount, 0);

    this._nodesToSplit = [this._rootNode];

    while (this._nodesToSplit.length > 0) 
    {
        var node = this._nodesToSplit.pop();
        this.splitNode(node);
    }
};

bvhtree.BVH.prototype.intersectRay = function(raycaster, obj) 
{
    let matrixWorld = obj.matrixWorld;
    let rayOrigin = raycaster.ray.origin;
    let rayDirection = raycaster.ray.direction;

    var nodesToIntersect = [this._rootNode];
    var itemsInIntersectingNodes = []; // a list of nodes that intersect the ray (according to their bounding box)
    var intersects = [];
    var i;

    var invRayDirection = new THREE.Vector3(1.0 / rayDirection.x, 1.0 / rayDirection.y, 1.0 / rayDirection.z);

    // console.log("ZoomIndependentSize = " +  ZoomIndependentSize);

    while (nodesToIntersect.length > 0) 
    {
        var node = nodesToIntersect.pop();
        if (bvhtree.BVH.intersectNodeBox(rayOrigin, invRayDirection, node, ZoomIndependentSize)) 
        {
            if (node._node0) { nodesToIntersect.push(node._node0); }
            if (node._node1) { nodesToIntersect.push(node._node1); }

            for (i = node._startIndex; i < node._endIndex; i++)
            {
                itemsInIntersectingNodes.push(this._bboxArray[i*7]);
            }
        }
    }

    if(itemsInIntersectingNodes.length == 0) { return intersects; }
    // console.log("intersecting potentially " + itemsInIntersectingNodes.length + " items");
    
    var rayOriginVec3 = new THREE.Vector3(rayOrigin.x, rayOrigin.y, rayOrigin.z);
    var rayDirectionVec3 = new THREE.Vector3(rayDirection.x, rayDirection.y, rayDirection.z);

    if(this.VerticesPerElement == 3)
    {
        var backfaceCulling = false;

        // go over the list of candidate triangles, and check each of them using ray triangle intersection
        var a = new THREE.Vector3();
        var b = new THREE.Vector3();
        var c = new THREE.Vector3();

        for (i = 0; i < itemsInIntersectingNodes.length; i++) 
        {
            var index = itemsInIntersectingNodes[i];

            a.fromArray(this._coordsArray, index * 9);
            b.fromArray(this._coordsArray, index * 9 + 3);
            c.fromArray(this._coordsArray, index * 9 + 6);
            
            var intersectionPoint = bvhtree.BVH.intersectRayTriangle(a, b, c, rayOriginVec3, rayDirectionVec3, backfaceCulling);
            if (intersectionPoint) 
            {
                var sqDistance = intersectionPoint.distanceToSquared(rayOriginVec3);
                intersects.push(
                {
                    index: index,
                    intersectionPoint: intersectionPoint,
                    sqDistance: sqDistance,
                    intersectionDim: 2,
                });
            }
        }

        return intersects;
    }

    if(this.VerticesPerElement == 2)
    {
        var backfaceCulling = false;

        var a = new THREE.Vector3();
        var b = new THREE.Vector3();

        for (i = 0; i < itemsInIntersectingNodes.length; i++) 
        {
            var index = itemsInIntersectingNodes[i];

            a.fromArray(this._coordsArray, index * 9);
            b.fromArray(this._coordsArray, index * 9 + 3);
            
            // var intersectionPoint = bvhtree.BVH.intersectRayTriangle(a, b, c, rayOriginVec3, rayDirectionVec3, backfaceCulling);
            // if (intersectionPoint) 
            // {
            //     var eyeToPointVec = new THREE.Vector3();
            //     eyeToPointVec.subVectors(intersectionPoint, rayOriginVec3);
            //     var sqDistance = eyeToPointVec.squareMagnitude();
            //     intersects.push(
            //     {
            //         triangle: [a.clone(), b.clone(), c.clone()],
            //         triangleIndex: index,
            //         intersectionPoint: intersectionPoint,
            //         sqDistance: sqDistance
            //     });
            // }
        }

        return intersects;
    }

    
    if(this.VerticesPerElement == 1)
    {
        var intersects = [];
        var intersectPoint = new THREE.Vector3();
        var inverseMatrix = new THREE.Matrix4();
        inverseMatrix.getInverse( matrixWorld );
        var ray = new THREE.Ray();
        ray.copy( raycaster.ray ).applyMatrix4( inverseMatrix );
        
        function testPoint(point, index) 
        {
            ray.closestPointToPoint(point, intersectPoint);

            var projectedPoint = point.clone().project(camera);
            var projectedPoint2 = intersectPoint.clone().project(camera);

            var screenDist = projectedPoint.distanceTo(projectedPoint2);

            if (screenDist < 0.03)
            {
				ray.closestPointToPoint(point, intersectPoint);
                intersectPoint.applyMatrix4(matrixWorld);
                
                // var rayPointDistanceSq = ray.distanceSqToPoint(point); //can be used to compute screen to world ratio
                var sqDistance = ray.origin.distanceToSquared(point);
                // console.log("distance is " + sqDistance);

				intersects.push( 
                {
					sqDistance: sqDistance,
                    index: index,
                    intersectionDim: 0,
				});
			}
       }
        var a = new THREE.Vector3();
        for (i = 0; i < itemsInIntersectingNodes.length; i++) 
        {
            var index = itemsInIntersectingNodes[i];
            a.fromArray(this._coordsArray, index * this.CoordsPerItem);
            testPoint(a, index);
        }

        return intersects;
    }
};

bvhtree.BVH.intersectNodeBox = function(rayOrigin, invRayDirection, node, tol) 
{
    let minX = node._extentsMin.x - tol;
    let maxX = node._extentsMax.x + tol;
    let minY = node._extentsMin.y - tol;
    let maxY = node._extentsMax.y + tol;
    let minZ = node._extentsMin.z - tol;
    let maxZ = node._extentsMax.z + tol;
    var t = bvhtree.BVH._calcTValues(minX, maxX, rayOrigin.x, invRayDirection.x);
    var ty = bvhtree.BVH._calcTValues(minY, maxY, rayOrigin.y, invRayDirection.y);

    if ((t.min > ty.max) || (ty.min > t.max)) { return false; }

    // These lines also handle the case where tmin or tmax is NaN
    // (result of 0 * Infinity). x !== x returns true if x is NaN
    if (ty.min > t.min || t.min !== t.min) { t.min = ty.min; }
    if (ty.max < t.max || t.max !== t.max) { t.max = ty.max; }

    var tz = bvhtree.BVH._calcTValues(minZ, maxZ, rayOrigin.z, invRayDirection.z);

    if ((t.min > tz.max) || (tz.min > t.max)) { return false; }
    if (tz.min > t.min || t.min !== t.min) { t.min = tz.min; }
    if (tz.max < t.max || t.max !== t.max) { t.max = tz.max; }

    //return point closest to the ray (positive side)
    if (t.max < 0 ) { return false; }
    return true;
};

bvhtree.BVH._calcTValues = function(minVal, maxVal, rayOriginCoord, invdir) 
{
    var res = {min: 0, max: 0};

    if ( invdir >= 0 )
    {
        res.min = (minVal - rayOriginCoord) * invdir;
        res.max = (maxVal - rayOriginCoord) * invdir;

    } 
    else
    {
        res.min = (maxVal - rayOriginCoord) * invdir;
        res.max = (minVal - rayOriginCoord) * invdir;
    }

    return res;
};


bvhtree.BVH.intersectRayTriangle = (function () 
{
    // Compute the offset origin, edges, and normal.
    var diff = new THREE.Vector3();
    var edge1 = new THREE.Vector3();
    var edge2 = new THREE.Vector3();
    var normal = new THREE.Vector3();

    return function (a, b, c, rayOrigin, rayDirection, backfaceCulling) {

        // from http://www.geometrictools.com/LibMathematics/Intersection/Wm5IntrRay3Triangle3.cpp

        edge1.subVectors(b, a);
        edge2.subVectors(c, a);
        normal.crossVectors(edge1, edge2);

        // Solve Q + t*D = b1*E1 + bL*E2 (Q = kDiff, D = ray direction,
        // E1 = kEdge1, E2 = kEdge2, N = Cross(E1,E2)) by
        //   |Dot(D,N)|*b1 = sign(Dot(D,N))*Dot(D,Cross(Q,E2))
        //   |Dot(D,N)|*b2 = sign(Dot(D,N))*Dot(D,Cross(E1,Q))
        //   |Dot(D,N)|*t = -sign(Dot(D,N))*Dot(Q,N)
        var DdN = rayDirection.dot(normal);
        var sign;
        if (DdN > 0) { if (backfaceCulling) { return null; } sign = 1; } else if (DdN < 0) { sign = -1; DdN = -DdN; } else { return null; }

        diff.subVectors(rayOrigin, a);
        var DdQxE2 = sign * rayDirection.dot(edge2.crossVectors(diff, edge2));
        if (DdQxE2 < 0) { return null; }  // b1 < 0, no intersection
        var DdE1xQ = sign * rayDirection.dot(edge1.cross(diff));
        if (DdE1xQ < 0) { return null; } // b2 < 0, no intersection
        if (DdQxE2 + DdE1xQ > DdN) { return null; } // b1+b2 > 1, no intersection
        var QdN = -sign * diff.dot(normal); // Line intersects triangle, check if ray does.
        if (QdN < 0) { return null; } // t < 0, no intersection

        // Ray intersects triangle.
        var t = QdN / DdN;
        var result = new THREE.Vector3();
        return result.copy( rayDirection ).multiplyScalar( t ).add( rayOrigin );
    };
}());

bvhtree.BVH.intersectRaySegment = (function () 
{
    var diff = new THREE.Vector3();
    var edge1 = new THREE.Vector3();
    return function (a, b, rayOrigin, rayDirection, tol) 
    {
        edge1.subVectors(b, a);
        diff.subVectors(rayOrigin, a);

    };
}());



bvhtree.BVH.prototype.calcBoundingBoxes = function(coordsArray)
{ 
    var p0x, p0y, p0z;    

    var elemCount = coordsArray.length / this.CoordsPerItem;
    var bboxArray = new Float32Array(elemCount * 7);

    var c = this.CoordsPerItem;
    for (var i = 0; i < elemCount; i++) 
    {
        var minX = Number.MAX_VALUE; var minY = minX; var minZ = minX;
        var maxX = -Number.MAX_VALUE; var maxY = maxX; var maxZ = maxX;

        for(var j = 0; j < this.VerticesPerElement; j++)
        {
            p0x = coordsArray[i * c + j * 3];
            p0y = coordsArray[i * c + j * 3 + 1];
            p0z = coordsArray[i * c + j * 3 + 2];
            minX = Math.min(minX, p0x);
            minY = Math.min(minY, p0y);
            minZ = Math.min(minZ, p0z);
            maxX = Math.max(maxX, p0x);
            maxY = Math.max(maxY, p0y);
            maxZ = Math.max(maxZ, p0z);
        }

        bvhtree.BVH.setBox(bboxArray, i, i, minX, minY, minZ, maxX, maxY, maxZ);
    }

    return bboxArray;
};


/**
 * Calculates the extents (i.e the min and max coordinates) of a list of bounding boxes in the bboxArray
 * @param startIndex the index of the first triangle that we want to calc extents for
 * @param endIndex the index of the last triangle that we want to calc extents for
 * @param expandBy a small epsilon to expand the bbox by, for safety during ray-box intersections
 */
bvhtree.BVH.prototype.calcExtents = function(startIndex, endIndex, expandBy) 
{
    expandBy = expandBy || 0.0;

    if (startIndex >= endIndex) { return [{'x': 0, 'y': 0, 'z': 0}, {'x': 0, 'y': 0, 'z': 0}]; }

    var minX = Number.MAX_VALUE; var minY = minX; var minZ = minX;
    var maxX = -Number.MAX_VALUE; var maxY = maxX; var maxZ = maxX;

    for (var i = startIndex; i < endIndex; i++)
    {
        minX = Math.min(this._bboxArray[i*7+1], minX);
        minY = Math.min(this._bboxArray[i*7+2], minY);
        minZ = Math.min(this._bboxArray[i*7+3], minZ);
        maxX = Math.max(this._bboxArray[i*7+4], maxX);
        maxY = Math.max(this._bboxArray[i*7+5], maxY);
        maxZ = Math.max(this._bboxArray[i*7+6], maxZ);
    }

    return [ {'x': minX - expandBy, 'y': minY - expandBy, 'z': minZ - expandBy}, {'x': maxX + expandBy, 'y': maxY + expandBy, 'z': maxZ + expandBy}];
};

bvhtree.BVH.prototype.splitNode = function(node) 
{
    if ((node.elementCount() <= this._maxElementsPerNode) || (node.elementCount() === 0)) { return; }

    var startIndex = node._startIndex;
    var endIndex = node._endIndex;

    var leftNode = [ [],[],[] ];
    var rightNode = [ [],[],[] ];
    var extentCenters = [node.centerX(), node.centerY(), node.centerZ()];

    var extentsLength = 
    [
        node._extentsMax.x - node._extentsMin.x,
        node._extentsMax.y - node._extentsMin.y,
        node._extentsMax.z - node._extentsMin.z
    ];

    var objectCenter = [];
    objectCenter.length = 3;

    for (var i = startIndex; i < endIndex; i++) 
    {
        objectCenter[0] = (this._bboxArray[i * 7 + 1] + this._bboxArray[i * 7 + 4]) * 0.5; // center = (min + max) / 2
        objectCenter[1] = (this._bboxArray[i * 7 + 2] + this._bboxArray[i * 7 + 5]) * 0.5; // center = (min + max) / 2
        objectCenter[2] = (this._bboxArray[i * 7 + 3] + this._bboxArray[i * 7 + 6]) * 0.5; // center = (min + max) / 2

        for (var j = 0; j < 3; j++) 
        {
            if (objectCenter[j] < extentCenters[j]) 
            {
                leftNode[j].push(i);
            }
            else 
            {
                rightNode[j].push(i);
            }
        }
    }

    // check if we couldn't split the node by any of the axes (x, y or z). halt here, dont try to split any more (cause it will always fail, and we'll enter an infinite loop
    var splitFailed = [];
    splitFailed.length = 3;

    splitFailed[0] = (leftNode[0].length === 0) || (rightNode[0].length === 0);
    splitFailed[1] = (leftNode[1].length === 0) || (rightNode[1].length === 0);
    splitFailed[2] = (leftNode[2].length === 0) || (rightNode[2].length === 0);

    if (splitFailed[0] && splitFailed[1] && splitFailed[2]) { return; }

    // choose the longest split axis. if we can't split by it, choose next best one.
    var splitOrder = [0, 1, 2];
    splitOrder.sort(function(axis0, axis1) { return (extentsLength[axis1] - extentsLength[axis0]) });

    var leftElements;
    var rightElements;

    for (j = 0; j < 3; j++) 
    {
        var candidateIndex = splitOrder[j];
        if (!splitFailed[candidateIndex]) 
        {
            leftElements = leftNode[candidateIndex];
            rightElements = rightNode[candidateIndex];

            break;
        }
    }

    // sort the elements in range (startIndex, endIndex) according to which node they should be at
    var node0Start = startIndex;
    var node0End = node0Start + leftElements.length;
    var node1Start = node0End;
    var node1End = endIndex;
    var currElement;

    var helperPos = node._startIndex;
    var concatenatedElements = leftElements.concat(rightElements);

    for (i = 0; i < concatenatedElements.length; i++) 
    {
        currElement = concatenatedElements[i];
        bvhtree.BVH.copyBox(this._bboxArray, currElement, this._bboxHelper, helperPos);
        helperPos++;
    }

    // copy results back to main array
    var subArr = this._bboxHelper.subarray(node._startIndex * 7, node._endIndex * 7);
    this._bboxArray.set(subArr, node._startIndex * 7);

    // create 2 new nodes for the node we just split, and add links to them from the parent node
    var node0Extents = this.calcExtents(node0Start, node0End, this.Epsilon);
    var node1Extents = this.calcExtents(node1Start, node1End, this.Epsilon);

    var node0 = new bvhtree.BVHNode(node0Extents[0], node0Extents[1], node0Start, node0End, node._level + 1);
    var node1 = new bvhtree.BVHNode(node1Extents[0], node1Extents[1], node1Start, node1End, node._level + 1);

    node._node0 = node0;
    node._node1 = node1;
    node.clearShapes();

    // add new nodes to the split queue
    this._nodesToSplit.push(node0);
    this._nodesToSplit.push(node1);
};

bvhtree.BVH.setBox = function(arr, pos, id, minX, minY, minZ, maxX, maxY, maxZ) 
{
    arr[pos*7] = id;
    arr[pos*7+1] = minX;
    arr[pos*7+2] = minY;
    arr[pos*7+3] = minZ;
    arr[pos*7+4] = maxX;
    arr[pos*7+5] = maxY;
    arr[pos*7+6] = maxZ;
};

bvhtree.BVH.copyBox = function(sArr, sP, dArr, dP) { for(var i = 0; i < 7; i++) { dArr[dP*7 + i] = sArr[sP*7 + i]; } };

bvhtree.BVH.getBox = function(arr, pos, outBox) 
{
    outBox.id = arr[pos*7];
    outBox.minX = arr[pos*7+1];
    outBox.minY = arr[pos*7+2];
    outBox.minZ = arr[pos*7+3];
    outBox.maxX = arr[pos*7+4];
    outBox.maxY = arr[pos*7+5];
    outBox.maxZ = arr[pos*7+6];
};

/**
 * A node in the BVH structure
 * @class
 * @param {Point} extentsMin the min coords of this node's bounding box ({x,y,z})
 * @param {Point} extentsMax the max coords of this node's bounding box ({x,y,z})
 * @param {number} startIndex an index in the bbox array, where the first element of this node is located
 * @param {number} endIndex an index in the bbox array, where the last of this node is located, plus 1 (meaning that its non-inclusive).
 * @param {number} the distance of this node from the root for the bvh tree. root node has level=0, its children have level=1 etc.
 */

bvhtree.BVHNode = class
{
    constructor(extentsMin, extentsMax, startIndex, endIndex, level)
    {
        this._extentsMin = extentsMin;
        this._extentsMax = extentsMax;
        this._startIndex = startIndex;
        this._endIndex = endIndex;
        this._level = level;
        this._node0 = null;
        this._node1 = null;
    }

    elementCount() { return this._endIndex - this._startIndex; };
    centerX() { return (this._extentsMin.x + this._extentsMax.x) * 0.5; };
    centerY() { return (this._extentsMin.y + this._extentsMax.y) * 0.5; };
    centerZ() { return (this._extentsMin.z + this._extentsMax.z) * 0.5; };
    clearShapes() { this._startIndex = -1; this._endIndex = -1; };

    calcBoundingSphereRadius(extentsMin, extentsMax) 
    {
        var centerX = (extentsMin.x + extentsMax.x) * 0.5;
        var centerY = (extentsMin.y + extentsMax.y) * 0.5;
        var centerZ = (extentsMin.z + extentsMax.z) * 0.5;
    
        var extentsMinDistSqr =
            (centerX - extentsMin.x) * (centerX - extentsMin.x) +
            (centerY - extentsMin.y) * (centerY - extentsMin.y) +
            (centerZ - extentsMin.z) * (centerZ - extentsMin.z);
    
        var extentsMaxDistSqr =
            (centerX - extentsMax.x) * (centerX - extentsMax.x) +
            (centerY - extentsMax.y) * (centerY - extentsMax.y) +
            (centerZ - extentsMax.z) * (centerZ - extentsMax.z);
    
        return Math.sqrt(Math.max(extentsMinDistSqr, extentsMaxDistSqr));
    };
}
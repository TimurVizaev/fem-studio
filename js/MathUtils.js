//Copyright Timur Vizaev 2014-2024
//
//FEM Studio

class Vector3 
{

    constructor(x, y, z) 
    {
        this.X = x;
        this.Y = y;
        this.Z = z;
    }

    Times(k) 
    {
        return new Vector3(k * this.X, k * this.Y, k * this.Z);
    }

    Minus(v) 
    {
        return new Vector3(this.X - v.X, this.Y - v.Y, this.Z - v.Z);
    }

    Plus(v) 
    {
        return new Vector3(this.X + v.X, this.Y + v.Y, this.Z + v.Z);
    }

    Dot(v) 
    {
        return this.X * v.X + this.Y * v.Y + this.Z * v.Z;
    }

    Magnitude() 
    {
        return Math.sqrt(this.X * this.X + this.Y * this.Y + this.Z * this.Z);
    }

    Unit()
    {
        let mag = this.Magnitude();
        let div = (mag === 0) ? Infinity : 1.0 / mag;
        return this.Times(div);
    }

    Cross(v) 
    {
        return new Vector3(this.Y * v.Z - this.Z * v.Y,
                          this.Z * v.X - this.X * v.Z,
                          this.X * v.Y - this.Y * v.X);
    }

    Distance(v)
    {
        let x = this.X - v.X;
        let y = this.Y - v.Y;
        let z = this.Z - v.Z;
        return Math.sqrt(x * x + y * y + z * z);
    }

    Keep(component)
    {
        switch(component)
        {
            case VectorialComponent.Magnitude: break;
            case VectorialComponent.X: this.Y = 0; this.Z = 0; break;
            case VectorialComponent.Y: this.X = 0; this.Z = 0; break;
            case VectorialComponent.Z: this.X = 0; this.Y = 0; break;
            case VectorialComponent.XY: this.Z = 0; break;
            case VectorialComponent.XZ: this.Y = 0; break;
            case VectorialComponent.YZ: this.X = 0; break;
        }
    }

}


class Matrix3
{
    constructor(m11, m12, m13, m21, m22, m23, m31, m32, m33)
    {
        this.M11 = m11; this.M12 = m12; this.M13 = m13;
        this.M21 = m21; this.M22 = m22; this.M23 = m23;
        this.M31 = m31; this.M32 = m32; this.M33 = m33;
    }

    Transform(v)
    {
        return new Vector3((this.M11 * v.X) + (this.M12 * v.Y) + (this.M13 * v.Z),
                           (this.M21 * v.X) + (this.M22 * v.Y) + (this.M23 * v.Z),
                           (this.M31 * v.X) + (this.M32 * v.Y) + (this.M33 * v.Z));
    }

    static Transformation(fromi, fromj, fromk, toi, toj, tok)
    {
		return new Matrix3(toi.Dot(fromi), toi.Dot(fromj), toi.Dot(fromk),
                           toj.Dot(fromi), toj.Dot(fromj), toj.Dot(fromk),
                           tok.Dot(fromi), tok.Dot(fromj), tok.Dot(fromk));
    }

    
}

Matrix3.Global = new Matrix3(1, 0, 0, 0, 1, 0, 0, 0, 1);

function DegreesToRadians(degrees)
{
    return degrees * Math.PI / 180;
}

function RadiansToDegrees(radians)
{
    return radians * 180 / Math.PI;
}
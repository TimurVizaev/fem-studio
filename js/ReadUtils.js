//Copyright Timur Vizaev 2014-2024
//
//FEM Studio

const FieldType = { INT: 1, FLOAT: 2, STRING: 3 };

class FieldDescriptor
{
    constructor(name, type)
    {
        this.Name = name;
        this.Type = type;
        this.IsArray = false;
        this.ArraySize = -1;

        this.IsEmpty = false;
        this.IsToEnd = false;
        this.ToEndDistance = 0;
        this.Format = 0;

        this.HasAltType = false;
        this.AltType = -1;
        this.AltName = "";

        // this.BytesToSkip = 0;
    }
}

class FormatDefinition
{
    constructor()
    {
        this.Descriptors = [];
        this.FormatIndex = 0;
        this.StartIndex = 0;
        this.EndingDefined = false;
    }

    Add(desc) { this.Descriptors.push(desc); }
    Length() { return this.Descriptors.length; }
    Last() { return this.Descriptors[this.Length() - 1]; }

    Find(name)
    {
        for(var i = 0; i < this.Descriptors.length; i++)
        {
            if(this.Descriptors[i].Name == name) { return this.Descriptors[i]; }
        }
        return null;
    }
}

class ReferenceDescriptor
{
    constructor(fieldName, name, targetType)
    {
        this.FieldName = fieldName;
        this.Name = name;
        this.TargetType = targetType;
    }
}

class ReferencesDefinition
{
    constructor()
    {
        this.References = [];
    }

    Ref(fieldName, name, targetType)
    {
        var ref = new ReferenceDescriptor(fieldName, name, targetType);
        this.References.push(ref);
        return this;
    }

    Element(fieldName, name) { return this.Ref(fieldName, name, FEMCardType.ELEMENT); }
    Node(fieldName, name) { return this.Ref(fieldName, name, FEMCardType.NODE); }
    Property(fieldName, name) { return this.Ref(fieldName, name, FEMCardType.PROPERTY); }
    Material(fieldName, name) { return this.Ref(fieldName, name, FEMCardType.MATERIAL); }
    System(fieldName, name) { return this.Ref(fieldName, name, FEMCardType.SYSTEM); }
}

class CardDefinition
{
    constructor()
    {
        this.Name = '';
        this.Start();
        this.Formats = [];
        this.Formats[0] = new FormatDefinition();

        this.References = [];
    }

    Start() { this.Pos = -1; this.CurrentFormat = 0; }
    Continue() { return this.Pos + 1 < this.Size(); }
    Next() { this.Pos++; return this.Formats[0].Descriptors[this.Pos]; }

    Int(name) { return this.Add(name, FieldType.INT); }
    Float(name) { return this.Add(name, FieldType.FLOAT); }
    String(name) { return this.Add(name, FieldType.STRING); }

    OrInt(name) { return this.Or(name, FieldType.INT); }
    OrFloat(name) { return this.Or(name, FieldType.FLOAT); }
    OrString(name) { return this.Or(name, FieldType.STRING); }

    Or(name, type)
    {
        var desc = this.GetLastDescriptor();
        desc.HasAltType = true;
        desc.AltName = name;
        desc.AltType = type;
        return this;
    }

    Array(size = 0)
    {
        var desc = this.GetLastDescriptor();
        desc.IsArray = true;
        desc.ArraySize = size;
        return this;
    }

    ToEnd(toEndDist = 0)
    {
        var desc = this.GetLastDescriptor();
        desc.IsToEnd = true;
        desc.ToEndDistance = toEndDist;
        return this;
    }

    Max(n)
    {
        var desc = this.GetLastDescriptor();
        desc.MaxSize = n;
        return this;
    }

    AlternativeFormat(n = 1) { this.Formats[n] = new FormatDefinition(); return this; }
    SameDescriptors(n) { this.Formats[this.Formats.size - 1].StartIndex = n; }
    Add(name, type) { this.Formats[0].Add(new FieldDescriptor(name, type)); return this; }

    Empty()
    {
        var desc = new FieldDescriptor('', FieldType.INT);
        desc.IsEmpty = true;
        this.Formats[0].Add(desc);
        return this;
    }

    Size()
    {
        let format = this.Formats[this.CurrentFormat];
        if(format.EndingDefined)
        {
            return format.StartIndex + format.Length();
        }
        return this.Formats[0].Length();
    }

    GetCurrentFormat() { return this.Formats[this.CurrentFormat]; }
    GetLastDescriptor() { return this.GetCurrentFormat().Last(); }

    //Binary definition:
    OP2(c1, c2, c3) { this.OP2Code = `${c1}${c2}${c3}`; return this; }

    SkipBytes(bytesToSkip)
    {
        var desc = this.GetLastDescriptor();
        desc.BytesToSkip = bytesToSkip;
        return this;
    }

    ReadOnly(entries)
    {
        this.ReadEntries = entries;
        this.SkipRemainingBytes = this.TotalBytes ? (this.TotalBytes - entries * 4) : (this.GetCurrentFormat().Length() - entries) * 4;
        return this;
    }

    TotalBytes(bytes)
    {
        this.TotalBytes = bytes;
        return this;
    }
}

class ResultsDefinition
{
    constructor()
    {
        this.Start();
        this.Descriptors = [];
        this.NEntries = 1;
        this.EntryStart = -1;
        this.Dimension = ResultValueDimension.Scalar;
    }

    Start() { this.Pos = -1; this.CurrentFormat = 0; }
    Continue() { return this.Pos + 1 < this.Descriptors.length; }
    Next() { this.Pos++; return this.Descriptors[this.Pos]; }

    Int(name) { return this.Add(name, FieldType.INT); }
    Float(name) { return this.Add(name, FieldType.FLOAT); }
    String(name) { return this.Add(name, FieldType.STRING); }

    Add(name, type) { this.Descriptors.push(new FieldDescriptor(name, type)); return this; }
    IsDefined() { return this.Descriptors.length > 0; }

    SkipBytes(bytesToSkip)
    {
        var desc = new FieldDescriptor(name);
        desc.BytesToSkip = bytesToSkip;
        this.Descriptors.push(desc);
        return this;
    }

    Tensor(n = 1)
    {
        this.NEntries = n;
        this.Dimension = ResultValueDimension.Tensorial;
        this.EntryStart = this.Descriptors.length - 1;
        return this;
    }

    Vector(n = 1)
    {
        this.NEntries = n;
        this.Dimension = ResultValueDimension.Vectorial;
        this.EntryStart = this.Descriptors.length - 1;
        return this;
    }

    Beam()
    {
        this.Dimension = ResultValueDimension.Beam;

    }

    CustomResult(func)
    {
        this.ValueProvider = func;
        return this;
    }

    NextEntry()
    {
        this.Pos = this.EntryStart;
    }
}

class NastranFields
{
    constructor() { this.Pos = 1; this.Vec = []; }
    Clear() { this.Pos = 1; this.Vec = []; }

    Add(field) { this.Vec.push(field); }

    GetInt() { if(this.Pos >= this.Vec.length) { return undefined; } return ToInt(this.Vec[this.Pos++]); }
    GetFloat() { if(this.Pos >= this.Vec.length) { return undefined; } return ToFloat(this.Vec[this.Pos++]); }

    GetString() { if(this.Pos >= this.Vec.length) { return undefined; } return this.Vec[this.Pos++]; }

    Parse(type)
    {
        if(type == FieldType.INT) { return this.GetInt(); }
        if(type == FieldType.FLOAT) { return this.GetFloat(); }
        if(type == FieldType.STRING) { return this.GetString(); }
    }

    RemoveEmptyEnd()
    {
        for(var i = this.Vec.length - 1; i > 0; i--) { if(IsNullOrWhitespace(this.Vec[i])) { continue; } break; }
        if(i < this.Vec.length - 1) { this.Vec = this.Vec.slice(0, i + 1); }
    }

    MoveToPrevious() { this.Pos--; }
    MoveToNext() { this.Pos++;}
    Advance(n) { this.Pos += n; }
    Continue() { return this.Pos + 1 <= this.Vec.length; }
    Size() { return this.Vec.length; }

}

function ToFloat(val) 
{
    var rt = null, aux;

    if ((aux = /(\+?\-?\d*\.\d*)((\-|\+)\d+)/g.exec(val))) //0.7+1 ou .70+1 ou 70.-1
    {
        rt = parseFloat(aux[1]) * Math.pow(10, aux[2]);
    }
       
    if (rt === null) { rt = parseFloat(val); }
    return rt;
}

function IsNullOrWhitespace(input) { return !input || !input.trim(); }
function IsWhitespace(c) { c == ' ' || c == '\t' || c == '\r'; }

function GetLineInfo(line)
{
    var isComment = false;
    var isLargeField = false;
    var isContinuation = false;
    var isInclude = false;

    var c0 = line.charAt(0);
    if(c0 == '$')
    {
        isComment = true;
        return ['', isComment, isLargeField, isContinuation, isInclude];
    }
    if ((c0 === '\0') || (c0 === '\n') || (c0 === '+') || (c0 === '*') || (c0 === ','))
    {
		isContinuation = true;
		isLargeField = (c0 === '*');
        return ['', isComment, isLargeField, isContinuation, isInclude];
    }

    var len = 0;
    isContinuation = true;
    isInclude = false;
    var c = line.charAt(0);
    while(c !== ' ' && len < 8)
    {
        if(c === '*')
        {
            isLargeField = true;
            return [line.substring(0, len), isComment, isLargeField, isContinuation, isInclude];
        }
        if(c === '\0' || c === '\n')
        {
            return [line.substring(0, len), isComment, isLargeField, isContinuation, isInclude];
        }
        isContinuation = false;

        len++;
        c = line.charAt(len);
    }

    isInclude = line.substring(0, 7).toUpperCase() === "INCLUDE";

    return [line.substring(0, len), isComment, isLargeField, isContinuation, isInclude];
}

var _LastFormat;

function AddFields(line, field0, isContinuation, isLargeField)
{
    if(!isContinuation) { _LastCardFields.Add(field0); }

    var effectiveField = isLargeField ? 16 : 8;
    _LastFormat = isLargeField ? 1 : 0;

    for(var i = 8; i <= 80 - effectiveField - 8; i += effectiveField)
    {
        _LastCardFields.Add(line.substring(i, i + effectiveField));
    }
}

function ToInt(str)
{
    for(var i = 0; i < str.length; i++)
    {
        if(str.charAt(i) == '.' || str.charAt(i) == ',') { return undefined; }
    }
    return parseInt(str);
}
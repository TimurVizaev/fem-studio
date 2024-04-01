//Copyright Timur Vizaev 2014-2024
//
//FEM Studio

var _LastCard = null;
var _LastCardFields = null;


class FEMReader
{
    constructor(fileOrUrl, onStart, onLoad) 
    {
        if(typeof fileOrUrl === 'string') {
            let url = fileOrUrl;
            let filename = url.split('/').pop();
            this.FEM = new FEMData(filename);
            this.FetchAndRead(url, onStart, onLoad);
        } 
        else
        {
            let file = fileOrUrl;
            this.FEM = new FEMData(file.name);
            this.Read(file, onStart, onLoad);
        }

    }

    Read(file, onStart, onLoad)
    {
        Console.log("Reading " + file.name);

        var reader = new FileReader();
        reader.readAsText(file,'UTF-8');
        
        reader.onloadstart = onStart;

        reader.onload = readerEvent => 
        {
           var content = readerEvent.target.result;
           this.LoadContent(content, onLoad)
        }
    }

    FetchAndRead(url, onStart, onLoad) 
    {
        onStart();
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        let scope = this;
        xhr.onload = function() 
        {
          if (xhr.status === 200) 
          {
            const content = xhr.responseText;
            scope.LoadContent(content, onLoad)
          }
          else 
          {
            console.error('Error: ' + xhr.statusText);
          }
        };
        xhr.send();
    }
    
    LoadContent(content, onLoad)
    {
        var memStart = window.performance.memory.usedJSHeapSize;
        
        var start = Date.now();

        this.ReadFEM(content);

        var mid = Date.now();
        onLoad(this.FEM);

        var end = Date.now();
        var memEnd = window.performance.memory.usedJSHeapSize;
        Console.info("FEM Reading took " + (mid - start) + " milliseconds");
        Console.info("FEM Rendering took " + (end - mid) + " milliseconds");
        Console.info("Memory used " + ((memEnd - memStart) / (1024 * 1024)).toFixed(2) + " MBs");
    }

    ReadFEM(content)
    {
        _LastCardFields = new NastranFields();

        var lines = content.split('\n');
        for(var i = 0; i < lines.length; i++)
        {
            var line = lines[i];
            var [f0, comm, large, cont, inc] = GetLineInfo(line);

            if(comm) { continue; }
            if(inc) { Console.error("Due to browser limitations " + line + " cannot be processed"); continue; }

            if(cont)
            {
                if(_LastCard)
                {
                    if(IsNullOrWhitespace(line)) { this.FlushLastCard(); } else { AddFields(line, f0, cont, large); }
                }
            }
            else
            {
                this.FlushLastCard();
                var card = CardConstructors[f0];
                if(card) { _LastCard = new card();  AddFields(line, f0, cont, large); } else { _LastCard = null; }
            }
        }
        this.FlushLastCard();

        this.FEM.ProcessCards();
        Console.info(this.FEM.Nodes.Count + " nodes read");
        Console.info(this.FEM.Elements.Count + " elements read");
        Console.info(this.FEM.Properties.Count + " properties read");
        Console.info(this.FEM.Materials.Count + " materials read");
        Console.info(this.FEM.CoordinateSystems.Count + " coordinate systems read")
    }
    
    FlushLastCard()
    {
        if(_LastCard) { _LastCardFields.RemoveEmptyEnd(); _LastCard.ReadFields(_LastCardFields); this.FEM.AddCard(_LastCard); _LastCard = null; }
        _LastCardFields.Clear();
    }
}

const OP2KeyStatus = { Success : 0, EndOfSlice : 1, EndOfFile : 2};
var OP2_IFPTables = new Set(['GEO', 'EPT', 'MPT']);
var OP2_OFPTables = new Set(['OES', 'OQG', 'OUG', 'OEF', 'OPG', 'OST', 'OGF']);

class OP2Reader
{
    constructor(file, onStart, loadFEM, loadResults) 
    { 
        this.FEM = new FEMData(file.name);
        this.Results = new FEMResults(this);

        this.GlobalLength = file.size;
        this._MaxSliceSize = 500 * 1024 * 1024;
        this.IsSliced = this.GlobalLength > this._MaxSliceSize;

        this._CurrentKey = new OP2Key(-1);
        this._PendingShift = 0;

        this.ScanBuffer = null;
        this.File = file;

        this.IsBigEndian = false;

        this._OpenedDatablocks = [];
        this._DataBlocks = [];

        console.log("File length is " + file.size);
        console.log("this._MaxSliceSize is " + this._MaxSliceSize);

        this.StartTime = Date.now();
        this.StartMemory = window.performance.memory.usedJSHeapSize;

        this.Status = OP2KeyStatus.Success;
        this.Read(file, onStart, function(fem, results) { loadFEM(fem); loadResults(results); });

        this.SliceIndex = 0;

        this.LastKeyValues = [];
        // this.IFPTables = [];
        this.OFPTables = [];

        this._LastBlock = new DataBlock(this);
    }

    ReadInternal(min, max, doNext, onStart = null)
    {
        var fileReader = new FileReader();

        fileReader.onloadstart = onStart;

        if(!this.IsSliced)
        {
            console.log("Reading whole File");
            fileReader.readAsArrayBuffer(this.File);
            max = this.GlobalLength;
        }
        else
        {
            console.log("Reading slice (" + min + ", " + max + ")");
            this.SliceIndex++;
            let slice = this.File.slice(min, max);
            fileReader.readAsArrayBuffer(slice);
        }
        
        var _this = this;
        fileReader.onload = readerEvent => 
        {
            this.ScanBuffer = new ByteBuffer(new jDataView(new Uint8Array(fileReader.result)), this.IsBigEndian, min, max);
            doNext(_this); 
        }
    }

    GetNextSliceMax()
    {
        var max = this.ScanBuffer.Max  + this._MaxSliceSize;
        return Math.min(this.GlobalLength, max);
    }

    PerformOP2Scan(onStart, doNext)
    {
        var scan = function(_this) 
        {
            _this.GetEndiannes();

            var mid = Date.now();

            var process = function(__this)
            {
                __this.ProcessFEM();

                var finish = function(___this)
                {
                    var end = Date.now();
                    var memEnd = window.performance.memory.usedJSHeapSize;
                    Console.info("OP2 Reading took " + (mid - ___this.StartTime) + " milliseconds");
                    Console.info("FEM Rendering took " + (end - mid) + " milliseconds");
                    Console.info("Memory used " + ((memEnd - ___this.StartMemory) / (1024 * 1024)).toFixed(2) + " MBs");
    
                    doNext();
                }

                __this.ProcessResults(finish);
            }

            _this.ScanKeys(process);
        };

        this.ReadInternal(0, this._MaxSliceSize, scan, onStart);
    }

    ScanKeys(afterScanKeys)
    {
        this.Status = OP2KeyStatus.Success;
        while(this.Status == OP2KeyStatus.Success)
        {
            this.GetNextKey(); 
            if(this.Status == OP2KeyStatus.Success)
            {
                this.HandleKey(this._CurrentKey)
            }  
        }

        if(this.Status == OP2KeyStatus.EndOfSlice)
        {
            var _this = this;
            this.ReadInternal(this.ScanBuffer.Max, this.GetNextSliceMax(), function() 
            { 
                _this.ScanKeys(afterScanKeys); 
            });
        }

        if(this.Status == OP2KeyStatus.EndOfFile)
        {
            console.log("End of File");
            afterScanKeys(this);
        }
    }

    HandleKey(key)
    {
        if(this.LastKeyValues.length > 2) { this.LastKeyValues.shift(); } 
        this.LastKeyValues.push(key.Value);
        if(this.LastKeyValues.length > 2)
        {
            if(this.LastKeyValues[0] == 2 && this.LastKeyValues[1] == -1 && this.LastKeyValues[2] == 7) //table start
            {
                this._LastTableName = this.ScanBuffer.DataView.getString(3, this.ScanBuffer.InternalPosition - 4 * 9);
                var realname = this.ScanBuffer.DataView.getString(8, this.ScanBuffer.InternalPosition - 4 * 9);
                console.log("Table started " +  this._LastTableName);
            }
            // else if(this.LastKeyValues[0] == 1 && this.LastKeyValues[1] == 0 && this.LastKeyValues[2] == 0) //table end
            // {
            //     // this.CurrentTable = null;
            // }
        }

        if(key.Value > 1)  
        { 
            this._LastBlock.Keys.push(key.Clone());
        }
        else if(key.Value < 0)
        {
            this._OpenedDatablocks.push(this._LastBlock);
            this._LastBlock = new DataBlock(this);
        }
        else if(key.Value == 0)
        {
            var openedBlocks = this._OpenedDatablocks.length;
            if(openedBlocks > 0)
            {
                var block = this._OpenedDatablocks.pop();
                if(openedBlocks > 1)
                {
                    this._OpenedDatablocks[openedBlocks - 2].DataBlocks.push(block);
                }
                else
                {
                    this._DataBlocks.push(block);
                    if(!(block.Keys.length > 0)) { return; }
                    var bKey = block.Keys[0];
                    if(bKey.Value == 2)
                    {
                        block.Name = this._LastTableName;
                        if(OP2_IFPTables.has(block.Name)) 
                        { 
                            block.IsIFP = true;
                            this.ProcessIFP(block);
                        }
                        else if(OP2_OFPTables.has(block.Name)) 
                        { 
                            block.IsOFP = true;
                            this.OFPTables.push(block);
                        }
                    }
                }
            }
        }
    }

    ProcessIFP(block)
    {
        this.ScanBuffer.StoreThisPosistion();

        block.InitIFP();
        for(var  j = 0; j < block.Contents.length; j++)
        {
            var femCont = block.Contents[j];

            var cards = femCont.GetCards();
            for(var k = 0; k < cards.length; k++)
            {
                this.FEM.AddCard(cards[k]);
            }
        }

        this.ScanBuffer.SetStoredPosition();
    }

    ProcessOFP(block, processOFPSingle, i, doLast)
    {
        var _i = i;
        var afterInit = function(_block)
        {
            for(var i = 0; i < _block.Contents.length; i++)
            {
                var id = _block.Contents[i].SUBCASE;
                var resultCase = _block.OP2.Results.Subcases.get(id);
                if(!resultCase)
                {
                    resultCase = new ResultCase(id)
                    _block.OP2.Results.Subcases.set(id, resultCase);
                    console.log("Adding subcase " + id);
                }
                
                resultCase.AddContent(_block.Contents[i]);
            }

            if(processOFPSingle) 
            { 
                processOFPSingle(_block.OP2, _i, doLast);
            }
        }
        block.InitOFP(afterInit);

    }

    ProcessFEM()
    {
        this.FEM.ProcessCards();
        Console.info(this.FEM.Nodes.Count + " nodes read");
        Console.info(this.FEM.Elements.Count + " elements read");
        Console.info(this.FEM.Properties.Count + " properties read");
        Console.info(this.FEM.Materials.Count + " materials read");
        Console.info(this.FEM.CoordinateSystems.Count + " coordinate systems read")
    }

    ProcessResults(doNext)
    {
        if(this.OFPTables.length == 0) { doNext(this); return; }
        this.ProcessOFPSingle(this, 0, doNext);
        //Console.info(this.Results.Subcases.length + " subcases read"); //TODO move this line
    }

    ProcessOFPSingle(_this, i, doNext)
    {
        var s = _this.OFPTables.length;

        var isLast = s == i + 1;
        var _doNext = doNext;
        var next = isLast ? 
        function() 
        {  
            _doNext(_this);
        } :
        function() 
        { 
            _this.ProcessOFPSingle(_this, i + 1, _doNext);
        };
 
        _this.ProcessOFP(_this.OFPTables[i], next, i + 1, doNext);
    }

    Read(file, onStart, onLoad)
    {
        var _this = this;
        this.PerformOP2Scan(onStart, function() { onLoad(_this.FEM, _this.Results); });
    }

    ReadOP2(content)
    {
    
    }

    GetEndiannes() { this.IsBigEndian = this.ScanBuffer.ReadInt32() > 8; this.ScanBuffer.Return(4); this.ScanBuffer.SetEndiannes(this.IsBigEndian); }
    FileEndReached() { return this.ScanBuffer.GetPosition() >= this.GlobalLength; }

    GetNextKey()
    {
        var shift = 4 + (this._CurrentKey.Value <= 1 ? 0 : (this._CurrentKey.Value + 2) * 4) - this._PendingShift;
        this._PendingShift = 0;
        this.ScanBuffer.Advance(shift);
        if(this.FileEndReached()) 
        { 
            console.log("End Of File Reached");
            this.Status = OP2KeyStatus.EndOfFile; return;
        }
        if(this.ScanBuffer.IsOutOfBounds()) 
        { 
            this._PendingShift = shift - (this.ScanBuffer.GetPosition() - this.ScanBuffer.Max);
            console.log("End Of Slice Reached");
            this.Status = OP2KeyStatus.EndOfSlice; return;
         }
   
        this._CurrentKey.Value = this.ScanBuffer.ReadInt32();
        this._CurrentKey.Position = this.ScanBuffer.GetPosition() + 8;
        this.ScanBuffer.Advance(4);
        this.Status = OP2KeyStatus.Success;
    }
}

class FEMResults
{
    constructor(op2)
    {
        this.Subcases = new Map();
        this.OP2 = op2;
    }
}

class OP2Key
{
    constructor(value = 0, position = 0) { this.Value = value; this.Position = position; }
    ByteValue() { return 4 * this.Value; }
    Clone() { return new OP2Key(this.Value, this.Position); }
}

class ByteBuffer //I think jDataview is too much overhead, try implement byte reading directly here (handling endianess) 
{
    constructor(dataView, isBigEndian, min, max)
    {
        this.InternalPosition = 0;
        this.DataView = dataView; 
        this.SetEndiannes(isBigEndian);
        this.Min = min;
        this.Max = max;
    }

    FromBuffer(buffer, accessKeys)
    {
        var length = 0;
        for(var i = 0; i < accessKeys.length; i++) { length += accessKeys[i].ByteValue(); }
        var data = new Uint8Array(length);
        
        buffer.SetPosition(accessKeys[0].Position);

        var accumulatedLength = 0;
        var skip = 20;
        for(var i = 0; i < accessKeys.length; i++)
        {
            if(i > 0) { buffer.Advance(skip); }
            var currentLength = accessKeys[i].ByteValue();
            var chunk = buffer.ReadBytes(currentLength);
            data.set(chunk, accumulatedLength);
            accumulatedLength += chunk.byteLength;
        }
        
        this.InternalPosition = 0;
        this.DataView = new jDataView(data); 
        this.SetEndiannes(buffer.IsBigEndian);
        this.Min = 0;
        this.Max = length;
    }

    SetEndiannes(bigEndian) { this.IsBigEndian = bigEndian; if(this.DataView) { this.DataView._littleEndian = !bigEndian; }}
    GetPosition() { return this.Min + this.InternalPosition; }
    SetPosition(n) {  this.InternalPosition = (n - this.Min); }
    SetInternalPosition(n) {  this.InternalPosition = n; }
    Advance(n) { this.InternalPosition += n; }
    Return(n) { this.InternalPosition -= n; }

    IsOutOfBounds() { return this.Min + this.InternalPosition >= this.Max; }

    Parse(type)
    {
        var value;
        if(type == FieldType.INT) { value = this.ReadInt32(); }
        else if(type == FieldType.FLOAT) { value = this.ReadFloat(); }
        else { value = this.ReadInt32(); }
        return value;
    }

    ReadInt32() { var r = this.DataView.getInt32(this.InternalPosition, !this.IsBigEndian); this.Advance(4); return r; }
    ReadFloat() { var r = this.DataView.getFloat32(this.InternalPosition, !this.IsBigEndian); this.Advance(4); return r; }

    ReadBytes(length)
    {
        var slicedBuffer = this.DataView.buffer.slice(this.InternalPosition, this.InternalPosition + length);
        this.Advance(length);
        return new Uint8Array(slicedBuffer);
    }

    ReadString(pos, length)
    {
        this.SetPosition(pos);
        return this.DataView.getString(length, pos);
    }

    StoreThisPosistion() { this.StoredPosition = this.InternalPosition; }
    SetStoredPosition() { this.InternalPosition = this.StoredPosition; }
}

class DataBlock
{
    constructor(op2)
    {
        this.OP2 = op2;
        this.Keys = [];
        this.DataBlocks = [];

        this.Buffer = null;

        this.Length = 0;
        this.AccessKeys = [];

        this.Contents = [];
    }

    GetStart() { return this.Keys[0].Position + 8; }
    GetEnd() 
    { 
        if(this.DataBlocks.length > 0)
        {
            var lastBlock = this.DataBlocks[this.DataBlocks.length - 1];
            return lastBlock.GetEnd();
        }
        else
        {
            var lastKey = this.Keys[this.Keys.length - 1];
            return lastKey.Position + lastKey.Value;
        }
    }

    InitIFP()
    {
        console.log("InitIFP");

        var init = function(_this)
        {
            for(var i = 2; i < _this.DataBlocks.length - 1; i++)
            {
                var accessKeys = _this.DataBlocks[i].Keys;
                _this.Buffer.SetPosition(accessKeys[0].Position);
                var identifier = new jDataView( _this.Buffer.ReadBytes(12));
                identifier._littleEndian = !_this.OP2.IsBigEndian;
                var c1 = identifier.getInt32();
                var c2 = identifier.getInt32();
                var c3 = identifier.getInt32();

                var codes = `${c1}${c2}${c3}`;
                var cardName = OP2CodeToCard[codes]

                console.log("       Codes are: " + c1 + " " + c2 + " " + c3 + "   -> card: " + cardName);
                if(cardName)
                {
                
                    var container = new OP2FEMContainer(cardName, accessKeys, _this.Buffer);
                    _this.Contents.push(container);
                }
            }
        }

        this.GetValidBuffer(init);
    }

    InitIFPInternal()
    {

    }

    InitOFP(doNext)
    {
        console.log("InitOFP " + this.Name);

        var init = function(_this)
        {
            for(var i = 2; i < _this.DataBlocks.length - 1; i+=2)
            {
                var accessKeys = _this.DataBlocks[i + 1].Keys;
                var idKey = _this.DataBlocks[i].Keys[0];
                _this.Buffer.SetPosition(idKey.Position);
                var identifier = new jDataView( _this.Buffer.ReadBytes(584));
                identifier._littleEndian = !_this.OP2.IsBigEndian;
                var table = new OP2ResultsTable(_this.Name, identifier, _this.Buffer, accessKeys)
                _this.Contents.push(table);
            }

            if(doNext) { doNext(_this); }
        };

        this.GetValidBuffer(init);
    }

    GetValidBuffer(doNext)
    {
        var start = this.GetStart();
        var end = this.GetEnd();
        var buffer = this.OP2.ScanBuffer;
        if(buffer.Min > start || buffer.Max < end)
        {
            var fileReader = new FileReader();
            var _this = this;
            fileReader.onload = readerEvent => 
            {
                _this.Buffer = new ByteBuffer(new jDataView(new Uint8Array(fileReader.result)), this.OP2.IsBigEndian, start, end);
                doNext(this);
            }

            let slice = this.OP2.File.slice(start, end);
            fileReader.readAsArrayBuffer(slice);
            console.log("Reading slice (GetValidBuffer)");
        }
        else
        {
            this.Buffer = buffer;
            doNext(this);
        }
    }
}

class OP2FEMContainer
{
    constructor(cardName, accessKeys, buffer)
    {
        this.ContainerBuffer = new ByteBuffer();
        this.ContainerBuffer.FromBuffer(buffer, accessKeys);
        this.Constructor = CardConstructors[cardName];
    }

    GetCards()
    {
        this.ContainerBuffer.SetPosition(12);
        var cards = [];
        if(this.Constructor)
        {
            while(!this.ContainerBuffer.IsOutOfBounds())
            {
                var card = new this.Constructor();
                card.ReadBinary(this.ContainerBuffer);
                cards.push(card);
            }
        }
        return cards;
    }
}


class OP2ResultsTable
{
    constructor(name, identifier, buffer, accessKeys)
    {
        this.TableName = name;
        this.Buffer = buffer;
        this.AccessKeys = accessKeys;

        this.ACODE = identifier.getInt32();
        this.TCODE = identifier.getInt32();
        this.ELTYPE = identifier.getInt32();
        this.SUBCASE = identifier.getInt32();

        var acode2 = this.ACODE;
        if(this.ACODE > 10) { acode2 = (this.ACODE / 10) >> 0; }
        // if(this.ACODE > 10) { acode2 = this.ACODE % 10; }
        
        switch(acode2)
        {
            case 2: this.MODE = identifier.getInt32(); this.EIGN = Math.sqrt(Math.abs(identifier.getFloat32())) / (2 * Math.PI); this.MODECYCL = identifier.getInt32(); break;
            case 5: this.FREQ = identifier.getInt32(); identifier.getInt32(); identifier.getInt32(); break;
            case 6: this.TIME = identifier.getInt32(); identifier.getInt32(); identifier.getInt32(); break;
            case 8: this.MODE = identifier.getInt32(); this.EIGN = identifier.getFloat32(); identifier.getInt32(); break;
            default: identifier.getInt32(); identifier.getInt32(); identifier.getInt32();
        }

        this.LOADSET = identifier.getInt32();
        this.FCODE = identifier.getInt32();
        this.NUMWDE = identifier.getInt32();
        this.SCODE = identifier.getInt32();

        // console.log("ACODE: " + this.ACODE + "    TCODE: " + this.TCODE + "    ELTYPE: " + this.ELTYPE + "    SUBCASE: " + this.SUBCASE);
        // console.log("LOADSET: " + this.LOADSET + "    FCODE: " + this.FCODE + "    NUMWDE: " + this.NUMWDE + "    SCODE: " + this.SCODE);

        identifier.seek(200);
        this.TITLE = identifier.getString(128).trim();
        this.SUBTITLE = identifier.getString(128).trim();
        this.LABEL = identifier.getString(128).trim();

        switch(this.TCODE)
        {
            case 1: //OUG - Displacement vector
            {
                this.Type = ResultsType.Displacements;
                this.EntryType = 'OUG';
                this.TargetType = ResultTargetType.Node;
                break;
            }
            case 2: //OPG - Load vector
            {
                break;
            }
            case 3: //OQG - SPC Force vector
            {
                this.Type = ResultsType.SPCForces;
                this.TargetType = ResultTargetType.Node;
                this.EntryType = 'OQG';
                break;
            }
            case 4: //OEF1X
            {
                this.Type = this.IsBar() ? ResultsType.BarForces : ResultsType.Fluxes;
                this.TargetType = ResultTargetType.Element;
                this.EntryType = 'OEF';
                break;
            }
            case 5: //OES - Element stress/strain
            {
                if(this.IsBar())
                {
                    this.Type = this.IsStrain() ? ResultsType.BarStrains : ResultsType.BarStress;
                }
                else
                {
                    this.Type = this.IsStrain() ? ResultsType.Strains : ResultsType.Stress;
                }
                this.TargetType = ResultTargetType.Element;
                this.EntryType = 'OES';
                break;
            }
            case 6: //LAMA - Eigenvalue summary
            {
                break;
            }
            case 7: //OUGV1 - Modal Modes or Eigenvalues
            {
                this.Type = ResultsType.Displacements;
                this.TargetType = ResultTargetType.Node;
                this.EntryType = 'OUG';
                break;
            }
            case 19: //OGF - Grid point force balance
            {
                Console.log("Reading OGF TABLE");
                this.Type = ResultsType.NodalForces;
                this.TargetType = ResultTargetType.Node;
                this.EntryType = 'OGF';
                break;
            }
            case 21: //OES - Strain/curvature at grid points
            {
                break;
            }
            case 25: //OEF - Composite failure indices
            {
                break;
            }
            case 39: //OQG - MPC forces
            {
                this.Type = ResultsType.MPCForces;
                this.TargetType = ResultTargetType.Node;
                this.EntryType = 'OQG';
                break;
            }
        }
    }

    IsBar() { return this.ELTYPE == 1 || this.ELTYPE == 2 || this.ELTYPE == 34; }
    IsStrain() { return this.TableName == 'OST'; } //should be extracted from SCODE.. but it is not reliable

    GetResultDefinition()
    {
        var defKey = this.EntryType + this.ELTYPE + this.FCODE + this.NUMWDE;

        var def = ResultDefinitions.get(defKey);
        if(!def)
        {
            def = new ResultsDefinition();
            
            if(this.EntryType == 'OEF')
            {
                if(this.ELTYPE == 33 || this.ELTYPE == 74)
                {
                    def.Tensor().Float('XX').Float('YY').Float('XY').Float('BMX').Float('BMY').Float('BMXY').Float('TX').Float('TY');
                }
                else if(this.ELTYPE == 34)
                {
                    def.Float('BM1A').Float('BM2A').Float('BM1B').Float('BM2B').Float('TS1').Float('TS2').Float('AF').Float('TRQ').CustomResult((r, c, f) => 
                    { 
                        return Math.abs(r.AF); 
                    });
                }
                else if(this.ELTYPE == 1)
                {
                    def.Float('AF').Float('TRQ').CustomResult((r, c, f) => 
                    { 
                        return Math.abs(r.AF); 
                    });
                }
                else if(this.ELTYPE == 2)
                {
                    def.Int('GRID').Float('SD').Float('BM1').Float('BM2').Float('TS1').Float('TS2').Float('AF').Float('TTRQ').Float('WTRQ').CustomResult((r, c, f) => 
                    { 
                        return Math.abs(r.AF); 
                    });
                }
            }
            if(this.EntryType == 'OES')
            {
                if(this.ELTYPE == 33 || this.ELTYPE == 74)
                {
                    def.Tensor(2).Float('FIBREDISTANCE').Float('XX').Float('YY').Float('XY').Float('THETA').Float('MajorPrincipal').Float('MinorPrincipal').Float("MaxShear");
                }
                else if(this.ELTYPE == 34) //CBAR
                {
                    def.SkipBytes(5 * 4).Float('EBMAXA').Float('EBMINA').SkipBytes(8 * 4).CustomResult((r, c, f) => 
                    { 
                        return Math.max(r.EBMAXA, Math.abs(r.EBMINA)); 
                    });
                }
                else if(this.ELTYPE == 1) //CROD
                {
                    def.Float('AE').Float('MSA').Float('TE').Float('MST').CustomResult((r, c, f) => 
                    { 
                        return Math.abs(r.AE); 
                    });
                }
                else if(this.ELTYPE == 2) //CBEAM
                {
                    def.SkipBytes(6 * 4).Float('EMAX').Float('EMIN').Float('MST').Float('MST').CustomResult((r, c, f) => 
                    { 
                        return Math.max(r.EMAX, Math.abs(r.EMIN)); 
                    });
                }
                else if(this.ELTYPE == 95 || this.ELTYPE == 97)
                {
                    def.Tensor().Int('LayerID').Float('XX').Float('YY').Float('XY').Float('XZ').Float('YZ').Float('THETA').Float('MajorPrincipal').Float('MinorPrincipal').Float("MaxShear");
                }
                else if(this.ELTYPE == 39 || this.ELTYPE == 67)
                {
                    // def.SkipBytes(4 * 3).Tensor().SkipBytes(4).Float('XX').Float('XY').SkipBytes(6 * 4).Float('YY').Float('YZ').SkipBytes(4 * 4).Float('ZZ').Float('ZX').SkipBytes(4 * 4 + 4 * 4 * 21);
                }
            }
            else if(this.EntryType == 'OUG')
            {
                def.Vector().SkipBytes(4).Float('X').Float('Y').Float('Z').Float('RX').Float('RY').Float('RZ');
            }
            else if(this.EntryType == 'OQG')
            {
                if(this.FCODE == 0 || this.FCODE == 2)
                {
                    def.Vector().SkipBytes(4).Float('X').Float('Y').Float('Z').Float('RX').Float('RY').Float('RZ');
                }
                else if(this.FCODE == 1)
                {
                    // def.Vector().SkipBytes(4).Float('X').Float('Y').Float('Z').Float('RX').Float('RY').Float('RZ').Float('iX').Float('iY').Float('iZ').Float('iRX').Float('iRY').Float('iRZ');
                }
            }
            else if(this.EntryType == 'OGF')
            {
                Console.log("Reading OGF Table");
                if(this.NUMWDE == 10)
                {
                    def.Vector().Int('EID').Float('X').Float('Y').Float('Z').Float('M1').Float('M2').Float('M3'); //X = F1, Y = F2, Z = F3
                }
                else if(this.NUMWDE == 16)
                {
                    def.Vector().Int('EID').Float('X').Float('Y').Float('Z').Float('M1R').Float('M2R').Float('M3R'). //X = F1R, Y = F2R, Z = F3R
                                            Float('F1I').Float('F2I').Float('F3I').Float('M1I').Float('M2I').Float('M3I'); 
                }
            }

            if(!def.IsDefined()) { return; }

            ResultDefinitions.set(defKey, def);
        }

        return def;
    }

    GetResults(results)
    {
        if(!this.EntryType) { return; }

        var def = this.GetResultDefinition();
        if(!def) { return; }

        if(!this.ContainerBuffer)
        {
            this.ContainerBuffer = new ByteBuffer();
            this.ContainerBuffer.FromBuffer(this.Buffer, this.AccessKeys);
        }

        this.ContainerBuffer.SetInternalPosition(0);

        // var results = new Map();
        var lastId = -1;
        while(!this.ContainerBuffer.IsOutOfBounds())
        {
            def.Start();
            let id = (this.ContainerBuffer.ReadInt32() / 10) >> 0;

            var res;
            if(id == lastId) { res = results.get(id); } else { res =  new FEMResult(id, this.TargetType); results.set(id, res); }
            lastId = id;
            
            for(var i = 0; i < def.NEntries; i++)
            {
                var val;

                if(!def.ValueProvider)
                {
                    if(def.Dimension == ResultValueDimension.Vectorial) { val = new VectorialResultValue(def); }
                    else if(def.Dimension == ResultValueDimension.Tensorial) { val = new TensorialResultValue(def); }
                    else if(def.Dimension == ResultValueDimension.Beam) { val = new BeamResultValue(def); }
                    else { val = new ScalarResultValue(def); }
                }
                else
                {
                    val = new CustomResultValue(def);
                }

                def.NextEntry();
                
                while(def.Continue())
                {
                    var desc = def.Next();
                    if(desc.BytesToSkip > 0) { this.ContainerBuffer.Advance(desc.BytesToSkip); continue; }
                    if(!desc.IsArray)
                    {
                        val[desc.Name] = this.ContainerBuffer.Parse(desc.Type);
                    }
                    else
                    {
                        val[desc.Name] = [];
                        
                        for(var j = 0; j < desc.ArraySize; j++)
                        {
                            val[desc.Name].push(this.ContainerBuffer.Parse(desc.Type));
                        }
                    }
                }

                res.Values.push(val);
            }
        }
    }
}

var ResultDefinitions = new Map();

const ResultsType = { Displacements: 1, Fluxes: 2, Stress: 3, Strains: 4, MPCForces: 5, SPCForces: 6, NodalForces: 7, BarForces: 8, BarStress: 9, BarStrains: 10 };
const ResultTargetType = { Node: 0, ELement: 1, Layer: 2, Sublayer: 3 };
const ResultValueDimension = { Scalar: 0, Vectorial: 1, Tensorial: 2, Beam: 3 };

const VectorialComponent = { Magnitude: 0, X: 1, Y: 2, Z: 3, XY: 4, XZ: 5, YZ: 6 };
const TensorialComponent = { VonMises: 0, MajorPrincipal: 1, MinorPrincipal: 2, MaxShear: 3, XX: 4, XY: 5, XZ: 6, YY: 7, YZ: 8, ZZ: 9 };
const BeamComponents = { Tension: 0, BendingMoment: 1, Torsion: 2 };

const FetchingType = { Min: 0, Max: 1, Average: 2, AbsoluteMax: 3, Top: 4, Bottom: 5 };

class FEMResult
{
    constructor(id, t, def)
    {
        this.ID = id;
        this.TargetType = t;
        this.Definition = def;
        this.Values = [];
    }

    GetValue(component, fetching)
    {
        let s = this.Values.length;
        if(s == 0) { return; }
        if(s == 1) { return this.Values[0].Get(component, fetching); }

        if(fetching == FetchingType.Top) { return this.Values[0].Get(component, fetching); }
        else if(fetching == FetchingType.Bottom) { return this.Values[s - 1].Get(component, fetching); }
    
        let min = Number.MAX_VALUE;
        let max = -Number.MAX_VALUE;
        let absmax = -Number.MAX_VALUE;
        let av = 0;
        for(var i = 0; i < s; i++)
        {
            let v = this.Values[i].Get(component, fetching);
            if(v < min) { min = v; }
            if(v > max) { max = v; }
            av += v;

            let absv = Math.abs(v);
            if(absv > absmax) { absmax = absv; }
        }
        av /= s;

        switch(fetching)
        {
            case FetchingType.Min: return min;
            case FetchingType.Max: return max;
            case FetchingType.Average: return av;
            case FetchingType.AbsoluteMax: return absmax;
        }
        
    }
}

class CustomResultValue
{
    constructor(def)
    {
        this.Definition = def;
    }

    Get(component, fetching)
    {
        return this.Definition.ValueProvider(this, component, fetching);
    }
}

class ScalarResultValue
{
    constructor()
    {
        this.Value = 0;
    }

    Get()
    {
        return this.Value;
    }
}

class TensorialResultValue
{
    constructor()
    {
        this.XX = 0;
        this.XY = 0;
        this.XZ = 0;
        this.YY = 0;
        this.YZ = 0;
        this.ZZ = 0;
    }

    Get(component)
    {
        switch(component)
        {
            case TensorialComponent.VonMises: return this.GetVonMises();
            case TensorialComponent.MajorPrincipal: return this.GetMajorPrincipal();
            case TensorialComponent.MinorPrincipal: return this.GetMinorPrincipal();
            case TensorialComponent.MaxShear: return this.GetMaxShear();
            case TensorialComponent.XX: return this.XX;
            case TensorialComponent.XY: return this.XY;
            case TensorialComponent.XZ: return this.XZ;
            case TensorialComponent.YY: return this.YY;
            case TensorialComponent.YZ: return this.YZ;
            case TensorialComponent.ZZ: return this.ZZ;
        }
    }

    GetVonMises()
    {
        if(this.VonMises == undefined)
        {
            var xx = this.XX;
            var yy = this.YY;
            var zz = this.ZZ;
            var xy = this.XY;
            var yz = this.YZ;
            var xz = this.XZ;
        
            var term1 = 0.5 * (Math.pow(xx - yy, 2) + Math.pow(yy - zz, 2) + Math.pow(zz - xx, 2));
            var term2 = 3 * (xy * xy + yz * yz + xz * xz);
            this.VonMises = Math.sqrt(term1 + term2);
        }
        return this.VonMises;
    }

    GetMajorPrincipal()
    {
        if(this.MajorPrincipal == undefined)
        {
            var xx = this.XX;
            var yy = this.YY;
            var zz = this.ZZ;

            this.MajorPrincipal = Math.max(xx, yy, zz);
        }
        return this.MajorPrincipal;
    }

    GetMinorPrincipal()
    {
        if(this.MinorPrincipal == undefined)
        {
            var xx = this.XX;
            var yy = this.YY;
            var zz = this.ZZ;

            this.MinorPrincipal = Math.min(xx, yy, zz);
        }
        return this.MinorPrincipal;
    }

    GetMaxShear()
    {
        if(this.MaxShear == undefined)
        {
            var xy = this.XY;
            var yz = this.YZ;
            var xz = this.XZ;

            this.MaxShear = Math.max(xy, yz, xz);
        }
        return this.MaxShear;
    }
}

class VectorialResultValue
{
    constructor()
    {
        this.X = 0;
        this.Y = 0;
        this.Z = 0;
    }

    Get(component)
    {
        switch(component)
        {
            case VectorialComponent.Magnitude: return Math.sqrt(this.X * this.X + this.Y * this.Y + this.Z * this.Z);
            case VectorialComponent.X: return this.X;
            case VectorialComponent.Y: return this.Y;
            case VectorialComponent.Z: return this.Z;
            case VectorialComponent.XY: return Math.sqrt(this.X * this.X + this.Y * this.Y);
            case VectorialComponent.XZ: return Math.sqrt(this.X * this.X + this.Z * this.Z);
            case VectorialComponent.YZ: return Math.sqrt(this.Y * this.Y + this.Z * this.Z);
        }
    }

    GetVector(component)
    {
        switch(component)
        {
            case VectorialComponent.Magnitude: return new Vector3(this.X, this.Y, this.Z);
            case VectorialComponent.X: return new Vector3(this.X, 0, 0);
            case VectorialComponent.Y: return new Vector3(0, this.Y, 0);
            case VectorialComponent.Z: return new Vector3(0, 0, this.Z);
            case VectorialComponent.XY: return new Vector3(this.X, this.Y, 0);
            case VectorialComponent.XZ: return new Vector3(this.X, 0, this.Z);
            case VectorialComponent.YZ: return new Vector3(0, this.Y, this.Z);
        }
    }
    
}

class BeamResultValue //TODO
{
    constructor()
    {
        this.Axial = 0;
        this.Bending = 0;
        this.Torsion = 0;
    }

    Get(component, fetching)
    {
        switch(component)
        {
            // case BeamComponents.Tension: return 
        }
    }
}

class ResultCase
{
    constructor(id)
    {
        this.ID = id;
        this.Modes = new Map();
        this.Results = new Map();
    }

    AddContent(content, isModal = true)
    {
        if(!this.Title) { this.Title = content.TITLE; }
        if(!this.Subtitle) { this.Subtitle = content.SUBTITLE; }
        if(!this.Label) { this.Label = content.LABEL; }

        var m = content.MODE;
        var t = content.Type;
        if(isModal && m)
        {
            if(!this.Modes.has(m))
            {
                var mode = new ResultCaseMode(this, m);
                mode.Eigenvalue = content.EIGN;
                this.Modes.set(m, mode);
            }
            this.Modes.get(m).AddContent(content, false);
            this.ContainsModalData = true;
        }
        else
        {
            var resultCase = this.Results.get(t);
            if(!resultCase)
            {
                resultCase = new ResultCaseResult(this, t);
                this.Results.set(t, resultCase);
            }
            resultCase.AddContent(content);
            if(t == ResultsType.Displacements)
            {
                this.ContainsDisplacements = true;
            }
        }
    }

    GetResults(type, mode = -1)
    {
        if(mode > 0)
        {
            var mode = this.Modes.get(type);
            if(mode) { return mode.GetResults(type); }
        }
        else
        {
            var result = this.Results.get(type);
            if(result) { return result.GetResults(type); }
        }
    }

    GetResult(type, mode = -1)
    {
        if(mode > 0)
        {
            var mode = this.Modes.get(type);
            if(mode) { return mode.GetResult(type); }
        }
        else
        {
            var result = this.Results.get(type);
            if(result) { return result.GetResult(type); }
        }
    }

    GetAvailableResults()
    {
        var results = [];
        for(const key of this.Results.keys())
        {
            if(key) { results.push(key); }
        }
        results.sort((a, b) => a - b);
        return results;
    }

    GetMode(mode) { return this.Modes.get(mode); }
}

class ResultCaseMode extends ResultCase
{
    constructor(parentCase, mode)
    {
        super();
        this.ParentCase = parentCase;
        this.Mode = mode;
    }
}

class ResultCaseResult
{
    constructor(parentCase, type)
    {
        this.ParentCase = parentCase;
        this.Type = type;
        this.Contents = new Map();
    }

    AddContent(content)
    {
        if(!this.Contents.has(content.Type)) { this.Contents.set(content.Type, new Array()); }
        this.Contents.get(content.Type).push(content);
    }

    GetResults(type)
    {
        var results = new Map();
        var c = this.Contents.get(type);
        if(c) { for(var i = 0; i < c.length; i++) { c[i].GetResults(results); } }
        return results;
    }
}

class CardPackage
{
    constructor()
    {
        this.Cards = new Map();
        this.MinID = Number.MAX_SAFE_INTEGER;
        this.MaxID = 0;
        this.Count = 0;
    }

    Add(x)
    {
        var id = x.ID;
        if(this.MaxID < id) { this.MaxID = id; }
        if(this.MinID > id) { this.MinID = id; }
        this.Count++;
        this.Cards.set(id, x);
    }

    Get(id)
    {
        if(id < 1) { return null; }
        return this.Cards.get(id);
    }

    Process()
    {
        for (const x of this.Cards.values()) { x.Process(); }
    }
}

class RenderInfo
{
    constructor()
    {
        this.MeshIndexBufferPosition = -1;
        this.MeshVertexBufferPosition = -1;
        this.LineIndexBufferPosition = -1;
        this.LineVertexBufferPosition = -1;
        this.PointIndexBufferPosition = -1;
        this.LabelBufferPosition = -1;

        this.TriaCount = 0;
        this.LineCount = 0;
        this.PointCount = 0;
        this.LabelLength = 0;

        this.R = 0.0;
        this.G = 0.0;
        this.B = 0.0;
    }

    SetMeshInfo(trias, meshIndexPos, meshVertexPos)
    {
        this.TriaCount = trias;
        this.MeshIndexBufferPosition = meshIndexPos;
        this.MeshVertexBufferPosition = meshVertexPos;
    }

    SetLineInfo(lines, lineIndexPos, lineVertex)
    {
        this.LineCount = lines;
        this.LineIndexBufferPosition = lineIndexPos;
        this.LineVertexBufferPosition = lineVertex;
    }
    SetPointInfo(points, pointIndex)
    {
        this.PointCount = points;
        this.PointIndexBufferPosition = pointIndex;
    }
    SetLabelInfo(labelLength, labelPos)
    {
        this.LabelLength = labelLength;
        this.LabelBufferPosition = labelPos;
    }
}

const RenderableType = { Node : 1, Element0D: 2, Element1D: 3, Element2D: 4, Element3D: 5, Connector: 6, MPC: 7 }; 
class RenderPackage
{
    constructor(type)
    {
        //THREE
        this.Mesh = null;
        this.Wireframe = null;
        this.Lines = null;
        this.Points = null;
        this.Labels = null;

        this.Type = type;
        this.LabelGeometry = null;

        //Data for attributes
        this.MeshVertices = [];
        this.MeshIndices = [];
        this.MeshColors = [];
        this.MeshValues = [];
        this.MeshOpacities = [];

        this.WireframeIndices = [];
        this.WireframeOpacities = [];
        // this.WireframeValues = [];

        this.MeshDisplacements = [];

        this.LineVertices = [];
        this.LineIndices = [];
        this.LineColors = [];
        this.LineValues = [];
        this.LineOpacities = [];
        this.LineDisplacements = [];

        this.PointVertices = [];
        this.PointColors = [];
        this.PointValues = [];
        this.PointOpacities = [];
        this.PointDisplacements = [];

        this.LabelIndices = [];
        //this.LabelVertices = [];
        this.LabelOpacities = [];
        this.LabelUVs = [];
        this.LabelCentroids = [];
        this.LabelOffsets = [];
        this.ElementSizes = [];

        //Mapping
        this.TriangleToItem = [];
        this.LineToItem = [];
        this.PointToItem = [];

        //BVH
        this.BVHTrias = [];
        this.BVHLines = [];
        this.BVHPoints = [];
        this.MeshBVH = null;
        this.LinesBVH = null;
        this.PointsBVH = null;

        this.TriaCount = 0;
        this.LineCount = 0;
        this.PointCount = 0;
        this.LabelCount = 0;

        this.Color = new FEXColor(100, 200, 0);
        this.Opacity = FEMOpt.Opacity;

        this.LabelsVisible = false;

        this.Items = [];

        this.IsBuilt = false;
        this.IsVisible = false;

        this.BoundingBox = new THREE.Box3();
    }

    Add(x)
    {
        if(!x.IsValid) { return; }

        this.Items.push(x);

        let trias = x.GetTriangles();
        let lines = x.GetLines();
        let points = x.GetPoints();

        var meshPos = this.MeshVertices.length / 3;
        var linePos = this.LineVertices.length / 3;

        var color = this.Color;
        var opacity = this.Opacity;

        let info = new RenderInfo();
        x.RenderInfo = info;

        for(var i = 0; i < points.length; i++)
        {
            var p = points[i];
            
            if(trias.length > 0)
            {
                info.SetMeshInfo(trias.length, this.MeshIndices.length, meshPos);

                this.MeshVertices.push(p.X, p.Y, p.Z);
                this.MeshColors.push(color.R, color.G, color.B);
                this.MeshValues.push(33); //???
                this.MeshOpacities.push(opacity);
                this.MeshDisplacements.push(0, 0, 0);

                this.WireframeOpacities.push(opacity);
                // this.WireframeValues.push(33); //???

            }
            else if(lines.length > 0)
            {
                info.SetLineInfo(lines.length, this.LineIndices.length, linePos);

                this.LineVertices.push(p.X, p.Y, p.Z);
                this.LineColors.push(color.R, color.G, color.B);
                this.LineOpacities.push(opacity);
                this.LineValues.push(33); //???
                this.LineDisplacements.push(0, 0, 0);
            }

            //ask renderable using a style..
            // if(false)
            // if(lines.length == 0 && trias.length == 0)
            if(trias.length == 0)
            {
                info.SetPointInfo(points.length, this.PointVertices.length / 3);

                this.PointVertices.push(p.X, p.Y, p.Z);
                this.PointColors.push(color.R, color.G, color.B);
                this.PointValues.push(33); //???
                this.PointOpacities.push(opacity);
                this.PointDisplacements.push(0, 0, 0);
                this.PointToItem[this.PointCount++] = x;
                this.BVHPoints.push(p.X, p.Y, p.Z);

            }
        }

        for(var i = 0; i < trias.length; i++)
        {
            for(var j = 0; j < 3; j++)
            {
                var p = trias[i][j] + meshPos;
                this.MeshIndices.push(p);
                this.BVHTrias.push(this.MeshVertices[p * 3], this.MeshVertices[p * 3 + 1], this.MeshVertices[p * 3 + 2]);
            }
            this.TriangleToItem[this.TriaCount++] = x;
        }

        for(var i = 0; i < lines.length; i++)
        {
            if(trias.length > 0)
            {
                for(var j = 0; j < 2; j++)
                {
                    var p = lines[i][j] + meshPos;
                    this.WireframeIndices.push(p);
                }
            }
            else
            {
                for(var j = 0; j < 2; j++)
                {
                    var p = lines[i][j] + linePos;
                    this.LineIndices.push(p);
                    this.BVHLines.push(this.LineVertices[p * 3], this.LineVertices[p * 3 + 1], this.LineVertices[p * 3 + 2]);
                }
                this.LineToItem[this.LineCount++] = x;
            }
        }

    }

    AddLabel(x)
    {
        if(!x.IsValid) { return; }

        var points = x.GetPoints();
        if(points.length == 0) { return; }
        var label = "" + x.ID;
        x.RenderInfo.SetLabelInfo(label.length, this.LabelOpacities.length);
        var c = x.GetCentroid();
        let elemSize = x.GetSize();

        for(var i = 0; i < label.length; i++)
        {
            for(var j = 0; j < 4; j++)
            {
                this.LabelOpacities.push(1.0);
                this.LabelCentroids.push(c.X, c.Y, c.Z);
                this.ElementSizes.push(elemSize);
            }

            this.LabelIndices.push(this.LabelCount * 4 + 0, this.LabelCount * 4 + 1, this.LabelCount * 4 + 2);
            this.LabelIndices.push(this.LabelCount * 4 + 0, this.LabelCount * 4 + 2, this.LabelCount * 4 + 3);
            this.LabelCount++;

            //texture coordinates
            var code = label.charCodeAt(i);

            let charCoords = GetFontTextureCoordinates(code);
            let u = charCoords[0];
            let v = charCoords[1];
            let deltaX = charCoords[2];
            let deltaY = charCoords[3];

            this.LabelUVs.push(u, v + deltaY,  u + deltaX, v + deltaY,  u + deltaX, v, u ,v);

            this.LabelOffsets.push
            (
               0.6 * i, 0.0,
               0.6 * i + 0.6, 0.0,
               0.6 * i + 0.6, 1.0, 
               0.6 * i, 1.0,
            )
        }
    }

    ShowLabels(state)
    {
        if(state == this.LabelsVisible) { return; }
        if(state)
        {
            for(var i = 0; i < this.Items.length; i++)
            {
                this.AddLabel(this.Items[i]);
            }

            this.LabelGeometry = new THREE.BufferGeometry();
            this.LabelGeometry.setIndex(this.LabelIndices);
            this.LabelGeometry.addAttribute('uv', new THREE.Float32BufferAttribute(this.LabelUVs, 2));
            this.LabelGeometry.addAttribute('opacity', new THREE.Float32BufferAttribute(this.LabelOpacities, 1));
            this.LabelGeometry.addAttribute('centroid', new THREE.Float32BufferAttribute(this.LabelCentroids, 3));
            this.LabelGeometry.addAttribute('offset', new THREE.Float32BufferAttribute(this.LabelOffsets, 2));
            this.LabelGeometry.addAttribute('elemSize', new THREE.Float32BufferAttribute(this.ElementSizes, 1));
        }

        this.LabelsVisible = state;
    }

    SetColor(c)
    {
        if(this.Color.R == c[0] && this.Color.G == c[1] && this.Color.B == c[2]) { return; }
        this.Color = new FEXColor(c[0], c[1], c[2]);
        if(!this.IsBuilt) { return; }

        if(this.MeshGeometry)
        {
            var meshColorAttr = this.MeshGeometry.attributes.color; var mA = meshColorAttr.array;
            for(var i = 0; i < mA.length; i+=3) { mA[i] = this.Color.R; mA[i + 1] = this.Color.G; mA[i + 2] = this.Color.B; }
            meshColorAttr.needsUpdate = true;
        }

        if(this.LineGeometry)
        {
            var lineColorAttr = this.LineGeometry.attributes.color;  var lA = lineColorAttr.array;
            for(var i = 0; i < lA.length; i+=3) { lA[i] = this.Color.R; lA[i + 1] = this.Color.G; lA[i + 2] = this.Color.B; }
            lineColorAttr.needsUpdate = true;
        }

        if(this.PointGeometry)
        {
            var pointColorAttr = this.PointGeometry.attributes.color; var pA = pointColorAttr.array;
            for(var i = 0; i < pA.length; i+=3) { pA[i] = this.Color.R; pA[i + 1] = this.Color.G; pA[i + 2] = this.Color.B; }
            pointColorAttr.needsUpdate = true;
        }
    }

    SetOpacity(o)
    {
        if(this.Opacity == o) { return; }
        this.Opacity = o;
        if(!this.IsBuilt) { return; }

        if(this.MeshGeometry)
        {
            var meshOpacityAttr = this.MeshGeometry.attributes.opacity; var mA = meshOpacityAttr.array;
            for(var i = 0; i < mA.length; i++) { mA[i] = o; }
            meshOpacityAttr.needsUpdate = true;
        }

        if(this.LineGeometry)
        {
            var lineOpacityAttr = this.LineGeometry.attributes.opacity; var lA = lineOpacityAttr.array;
            for(var i = 0; i < lA.length; i++) { lA[i] = o; }
            lineOpacityAttr.needsUpdate = true;
        }

        if(this.PointGeometry)
        {
            var pointOpacityAttr = this.PointGeometry.attributes.opacity; var pA = pointOpacityAttr.array;
            for(var i = 0; i < pA.length; i++) { pA[i] = o; }
            pointOpacityAttr.needsUpdate = true;
        }
    }

    Build()
    {
        if(this.IsBuilt) { return; }

        if(this.MeshIndices.length > 0)
        {     
            this.MeshGeometry = new THREE.BufferGeometry();

            this.MeshGeometry.setIndex(this.MeshIndices);
            var positionAttr =  new THREE.Float32BufferAttribute(this.MeshVertices, 3);
            var displacementAttr =  new THREE.Float32BufferAttribute(this.MeshDisplacements, 3);
            var valueAttr = new THREE.Float32BufferAttribute(this.MeshValues, 1);
            this.MeshGeometry.addAttribute('position', positionAttr);
            this.MeshGeometry.addAttribute('color', new THREE.Float32BufferAttribute(this.MeshColors, 3)); 
            this.MeshGeometry.addAttribute('value', valueAttr); 
            this.MeshGeometry.addAttribute('displacement', displacementAttr);
            this.MeshGeometry.addAttribute('opacity',  new THREE.Float32BufferAttribute(this.MeshOpacities, 1));

            this.MeshGeometry.computeBoundingBox();
            this.MeshGeometry.computeBoundingSphere();  
            this.BoundingBox.union(this.MeshGeometry.boundingBox);
      
            this.WireframeGeometry = new THREE.BufferGeometry();
            this.WireframeGeometry.setIndex(this.WireframeIndices);
            this.WireframeGeometry.addAttribute('position', positionAttr);
            this.WireframeGeometry.addAttribute('displacement', displacementAttr);
            this.WireframeGeometry.addAttribute('opacity', new THREE.Float32BufferAttribute(this.WireframeOpacities, 1));
            this.WireframeGeometry.addAttribute('value', valueAttr); 


            if(this.BVHTrias.length > 0)
            {
                this.MeshBVH = new bvhtree.BVH(this.BVHTrias, 3);
                // drawBVHNodeExtents(this.MeshBVH._rootNode);
            }
        }

        if(this.LineIndices.length > 0)
        {
            this.LineGeometry = new THREE.BufferGeometry();
            this.LineGeometry.setIndex(this.LineIndices);
            this.LineGeometry.addAttribute('position', new THREE.Float32BufferAttribute(this.LineVertices, 3));
            this.LineGeometry.addAttribute('color', new THREE.Float32BufferAttribute(this.LineColors, 3));
            this.LineGeometry.addAttribute('value', new THREE.Float32BufferAttribute(this.LineValues, 1)); 
            this.LineGeometry.addAttribute('displacement', new THREE.Float32BufferAttribute(this.LineDisplacements, 3));
            this.LineGeometry.addAttribute('opacity',  new THREE.Float32BufferAttribute(this.LineOpacities, 1));
    
            this.LineGeometry.computeBoundingBox();
            this.LineGeometry.computeBoundingSphere();
            this.BoundingBox.union(this.LineGeometry.boundingBox);

            if(this.BVHLines.length > 0)
            {
                // this.LinesBVH = new bvhtree.BVH(this.BVHLines, 2);
                // drawBVHNodeExtents(this.LinesBVH._rootNode);
            }
        }

        if(this.PointVertices.length > 0)
        {
            this.PointGeometry = new THREE.BufferGeometry();
            this.PointGeometry.addAttribute('position', new THREE.Float32BufferAttribute(this.PointVertices, 3));
            this.PointGeometry.addAttribute('color', new THREE.Float32BufferAttribute(this.PointColors, 3));
            this.PointGeometry.addAttribute('value', new THREE.Float32BufferAttribute(this.PointValues, 1)); 
            this.PointGeometry.addAttribute('displacement', new THREE.Float32BufferAttribute(this.PointDisplacements, 3));
            this.PointGeometry.addAttribute('opacity', new THREE.Float32BufferAttribute(this.PointOpacities, 1));
            
            this.PointGeometry.computeBoundingBox();
            this.PointGeometry.computeBoundingSphere(); 
            // this.BoundingBox.union(this.PointGeometry.boundingBox); //disabled points contribution to the bounding box (is this okey?)

             if(this.BVHPoints.length > 0)
            {
                var size = new THREE.Vector3();
                this.PointGeometry.boundingBox.getSize(size);
                var maxSize = Math.max(size.x, Math.max(size.y, size.z));

                var extend =  0.2 * maxSize / Math.cbrt(this.PointVertices.length / 3);
                // console.log("extending nodes " + extend);
                this.PointsBVH = new bvhtree.BVH(this.BVHPoints, 1, extend);
                // drawBVHNodeExtents(this.PointsBVH._rootNode);
            }
        }

        this.IsBuilt = true;
    }

    GetObjectByTriangleIndex(index)
    {
        return this.TriangleToItem[index];
    }

    GetObjectByPointIndex(index)
    {
        return this.PointToItem[index];
    }

    Hide(items) { this.Show(items, false); }
    ShowAll() { this.Show(this.Items); }

    Show(items, state = true)
    {
        let o = state ? this.Opacity : 0.0;
        let meshOpacityAttr =  this.MeshGeometry ? this.MeshGeometry.attributes.opacity : undefined;
        let wireframeOpacityAttr = this.WireframeGeometry ? this.WireframeGeometry.attributes.opacity : undefined;
        let lineOpacityAttr =  this.LineGeometry ? this.LineGeometry.attributes.opacity : undefined;
        let pointOpacityAttr = this.PointGeometry ? this.PointGeometry.attributes.opacity : undefined;

        let labelOpacityAttr = FEMOpt.ShowLabels ? this.LabelGeometry.attributes.opacity : undefined;

        // var pPos = 0;
        for (const x of items.values())
        {
            let info = x.RenderInfo;
            if(x._IsVisible == state) { continue; }
            x._IsVisible = state;

            if(meshOpacityAttr)
            {
                for(var j = 0; j < x.Nodes.length; j++)
                {
                    meshOpacityAttr.array[info.MeshVertexBufferPosition + j] = o;
                    wireframeOpacityAttr.array[info.MeshVertexBufferPosition + j] = o;
                }
            }

            if(lineOpacityAttr)
            {
                for(var j = 0; j < x.Nodes.length; j++)
                {
                    lineOpacityAttr.array[info.LineVertexBufferPosition + j] = o;
                }
            }

            
            if(pointOpacityAttr)
            {
                for(var j = 0; j < x.Nodes.length; j++)
                {
                    // pointOpacityAttr.array[pPos++] = 0.0;
                    pointOpacityAttr.array[info.PointIndexBufferPosition + j] = o;
                }
            }

            if(FEMOpt.ShowLabels)
            {
                for(var j = 0; j < info.LabelLength * 4; j++)
                {
                    labelOpacityAttr.array[info.LabelBufferPosition + j] = o;
                }
            }
            
        }
        
        if(meshOpacityAttr) { meshOpacityAttr.needsUpdate = true; }
        if(wireframeOpacityAttr) { wireframeOpacityAttr.needsUpdate = true; }
        if(lineOpacityAttr) { lineOpacityAttr.needsUpdate = true; }
        if(pointOpacityAttr) { pointOpacityAttr.needsUpdate = true; }

        if(FEMOpt.ShowLabels)
        {
            labelOpacityAttr.needsUpdate = true;
        }
    }


    UpdateValuesAttribute(flagOnly = false, nodal = false)
    {
        var meshValueAttr = this.MeshGeometry ? this.MeshGeometry.getAttribute('value') : undefined;
        var lineValueAttr = this.LineGeometry ? this.LineGeometry.getAttribute('value') : undefined;
        var pointValueAttr = this.PointGeometry ? this.PointGeometry.getAttribute('value') : undefined;

        var pPos = 0;
        if(!flagOnly)
        {
            if(!meshValueAttr && !lineValueAttr && !pointValueAttr) { return; }
            for(var i = 0; i < this.Items.length; i++)
            {
                let x = this.Items[i];

                if(meshValueAttr)
                {
                    let pos = x.RenderInfo.MeshVertexBufferPosition;
                    if(!nodal)
                    {
                        for(var j = 0; j < x.RenderInfo.TriaCount * 3; j++)
                        {
                            meshValueAttr.array[pos++] = x.AttachedValue;
                        }
                    }
                    else
                    {
                        for(var j = 0; j < x.Nodes.length; j++)
                        {
                            let n = x.Nodes[j];
                            meshValueAttr.array[pos++] = n.AttachedValue;
                        }
                    }
                }

                if(lineValueAttr)
                {
                    let pos = x.RenderInfo.LineVertexBufferPosition;
                    if(!nodal)
                    {
                        for(var j = 0; j < x.RenderInfo.LineCount * 3; j++)
                        {
                            lineValueAttr.array[pos++] = x.AttachedValue;
                        }
                    }
                    else
                    {
                        for(var j = 0; j < x.Nodes.length; j++)
                        {
                            let n = x.Nodes[j];
                            lineValueAttr.array[pos++] = n.AttachedValue;
                        }
                    }
                }

                if(pointValueAttr)
                {
                    if(this.Type == RenderableType.Node)
                    {
                        pointValueAttr.array[pPos++] = x.AttachedValue;
                    }
                    else
                    {
                        let pos = x.RenderInfo.PointIndexBufferPosition;
                        if(!nodal)
                        {
                            for(var j = 0; j < x.RenderInfo.LineCount * 3; j++)
                            {
                                pointValueAttr.array[pos++] = x.AttachedValue;
                            }
                        }
                        else
                        {
                            for(var j = 0; j < x.Nodes.length; j++)
                            {
                                let n = x.Nodes[j];
                                pointValueAttr.array[pos++] = n.AttachedValue;
                            }
                        }
                    }
                }
            }
        }


        if(meshValueAttr) { meshValueAttr.needsUpdate = true; }
        if(lineValueAttr) { lineValueAttr.needsUpdate = true; }
        if(pointValueAttr) { pointValueAttr.needsUpdate = true; }
    }

    UpdateColors(nodal = false)
    {
        var meshColorAttr = this.MeshGeometry ? this.MeshGeometry.getAttribute('color') : undefined;
        var lineColorAttr = this.LineGeometry ? this.LineGeometry.getAttribute('color') : undefined;

        let noColorInfo = new RenderInfo();
        noColorInfo.R = 0.44;
        noColorInfo.G = 0.74;
        noColorInfo.B = 0.44;

        for(var i = 0; i < this.Items.length; i++)
        {
            let x = this.Items[i];

            if(meshColorAttr)
            {
                let pos = x.RenderInfo.MeshVertexBufferPosition * 3;

                if(!nodal)
                {
                    let rInfo = x.RenderInfo;
                    if(!rInfo) { rInfo = noColorInfo; }

                    for(var j = 0; j < x.RenderInfo.TriaCount * 3; j++)
                    {
                        meshColorAttr.array[pos + 3 * j] = rInfo.R;
                        meshColorAttr.array[pos + 3 * j + 1] = rInfo.G;
                        meshColorAttr.array[pos + 3 * j + 2] = rInfo.B;
                    }
                }
                else
                {
                    var resultValue = 0;
                    for(var j = 0; j < x.Nodes.length; j++)
                    {
                        let n = x.Nodes[j];
                        if(n.AttachedValue == undefined) { resultValue = undefined; }
                        if(resultValue != undefined) { resultValue += n.AttachedValue; }

                        let rInfo = n.RenderInfo;
                        if(!rInfo) 
                        { 
                            rInfo = noColorInfo;
                        }
                        meshColorAttr.array[pos + 3 * j] = rInfo.R;
                        meshColorAttr.array[pos + 3 * j + 1] = rInfo.G;
                        meshColorAttr.array[pos + 3 * j + 2] = rInfo.B;
                    }

                    if(resultValue != undefined)
                    {
                        x.AttachedValue = resultValue / x.Nodes.length;
                    }
                    else
                    {
                        x.AttachedValue = undefined;
                    }
                }
            }

            if(lineColorAttr)
            {
                let pos = x.RenderInfo.LineVertexBufferPosition * 3;
                for(var j = 0; j < x.RenderInfo.LineCount * 3; j++)
                {
                    lineColorAttr.array[pos + 3 * j] = x.RenderInfo.R;
                    lineColorAttr.array[pos + 3 * j + 1] = x.RenderInfo.G;
                    lineColorAttr.array[pos + 3 * j + 2] = x.RenderInfo.B;
                }
            }
        }

        if(meshColorAttr) { meshColorAttr.needsUpdate = true; }
        if(lineColorAttr) { lineColorAttr.needsUpdate = true; }
    }

    UpdateDisplacements()
    {
        var meshDispAttr = this.MeshGeometry ? this.MeshGeometry.getAttribute('displacement') : undefined;
        var lineDispAttr = this.LineGeometry ? this.LineGeometry.getAttribute('displacement') : undefined;
        var pointDispAttr = this.PointGeometry ? this.PointGeometry.getAttribute('displacement') : undefined;

        let pPos = 0;
        let scale = ResOpt.Scale;

        if(this.Type == RenderableType.Node) 
        { 
            if(this.IsVisible && pointDispAttr)
            {
                for(var i = 0; i < this.Items.length; i++)
                {
                    var d = this.Items[i]._Disp;
                    pointDispAttr.array[pPos++] = d ? scale * d.X : 0;
                    pointDispAttr.array[pPos++] = d ? scale * d.Y : 0;
                    pointDispAttr.array[pPos++] = d ? scale * d.Z : 0;
                }
                pointDispAttr.needsUpdate = true;
            }
            return;
        }
        
        for(var i = 0; i < this.Items.length; i++)
        {
            let x = this.Items[i];

            if(meshDispAttr)
            {
                let pos = x.RenderInfo.MeshVertexBufferPosition * 3;
                for(var j = 0; j < x.Nodes.length; j++)
                {
                    var d = x.Nodes[j]._Disp;
                    meshDispAttr.array[pos++] = d ? scale * d.X : 0;
                    meshDispAttr.array[pos++] = d ? scale * d.Y : 0;
                    meshDispAttr.array[pos++] = d ? scale * d.Z : 0;
                }
            }
            
            if(lineDispAttr)
            {
                let pos = x.RenderInfo.LineVertexBufferPosition * 3;
                for(var j = 0; j < x.Nodes.length; j++)
                {
                    var d = x.Nodes[j]._Disp;
                    lineDispAttr.array[pos++] = d ? scale * d.X : 0;
                    lineDispAttr.array[pos++] = d ? scale * d.Y : 0;
                    lineDispAttr.array[pos++] = d ? scale * d.Z : 0;
                }
            }

            if(pointDispAttr)
            {
                // let pos = x.RenderInfo.PointIndexBufferPosition * 3;
                for(var j = 0; j < x.Nodes.length; j++)
                {
                    var d = x.Nodes[j]._Disp;
                    pointDispAttr.array[pPos++] = d ? scale * d.X : 0;
                    pointDispAttr.array[pPos++] = d ? scale * d.Y : 0;
                    pointDispAttr.array[pPos++] = d ? scale * d.Z : 0;
                }
            }
        }

        if(meshDispAttr) { meshDispAttr.needsUpdate = true; }
        if(lineDispAttr) { lineDispAttr.needsUpdate = true; }
        if(pointDispAttr) { pointDispAttr.needsUpdate = true; }

    }
}


class FEMData
{
    constructor(filename)
    {
        this.Filename = filename;
        this.Nodes = new CardPackage();
        this.Elements = new CardPackage();
        this.Properties = new CardPackage();
        this.Materials = new CardPackage();
        this.CoordinateSystems = new CardPackage();

        this.Packages = new Map([
        [RenderableType.Node, new RenderPackage(RenderableType.Node)],
        [RenderableType.Element0D, new RenderPackage(RenderableType.Element0D)],
        [RenderableType.Element1D, new RenderPackage(RenderableType.Element1D)],
        [RenderableType.Element2D, new RenderPackage(RenderableType.Element2D)],
        [RenderableType.Element3D, new RenderPackage(RenderableType.Element3D)],
        [RenderableType.MPC, new RenderPackage(RenderableType.MPC)],
        [RenderableType.Connector, new RenderPackage(RenderableType.Connector)]]);

        this.RenderMode = RenderMode.Standard;

        this.BoundingBox = new THREE.Box3();
    }

    AddCard(card)
    {
        if(card instanceof FEMNode) { this.AddNode(card); }
        else if(card instanceof FEMElement) { this.AddElement(card); }
        else if(card instanceof FEMProperty) { this.AddProperty(card); }
        else if(card instanceof FEMMaterial) { this.AddMaterial(card); }
        else if(card instanceof FEMCoordinateSystem) { this.AddSystem(card); }
    }

    AddNode(x) { x.SetFEM(this); this.Nodes.Add(x); }
    AddElement(x) { x.SetFEM(this); this.Elements.Add(x); }
    AddProperty(x) { x.SetFEM(this); this.Properties.Add(x); }
    AddMaterial(x) { x.SetFEM(this); this.Materials.Add(x); }
    AddSystem(x) { x.SetFEM(this); this.CoordinateSystems.Add(x); }

    GetNode(id) { return this.Nodes.Get(id); }
    GetElement(id) { return this.Elements.Get(id); }
    GetProperty(id) { return this.Properties.Get(id); }
    GetMaterial(id) { return this.Materials.Get(id); }
    GetSystem(id) { return this.CoordinateSystems.Get(id); }

    Get(type, id)
    {
        switch(type)
        {
            case FEMCardType.ELEMENT: return this.GetElement(id);
            case FEMCardType.NODE: return this.GetNode(id);
            case FEMCardType.PROPERTY: return this.GetProperty(id);
            case FEMCardType.MATERIAL: return this.GetMaterial(id);
            case FEMCardType.SYSTEM: return this.GetSystem(id);
        }
        return null;
    }

    ProcessCards()
    {
        this.Nodes.Process();
        this.Elements.Process();
        this.Properties.Process();
        this.Materials.Process();
        this.CoordinateSystems.Process();
    }

    SetStandardColor()
    {
        this.Packages.get(RenderableType.Node).SetColor(FEMOpt.NodesColor);
        this.Packages.get(RenderableType.Element0D).SetColor(FEMOpt.Elements0DColor);
        this.Packages.get(RenderableType.Element1D).SetColor(FEMOpt.Elements1DColor);
        this.Packages.get(RenderableType.Element2D).SetColor(FEMOpt.Elements2DColor);
        this.Packages.get(RenderableType.Element3D).SetColor(FEMOpt.Elements3DColor);
        this.Packages.get(RenderableType.MPC).SetColor(FEMOpt.MPCsColor);
        this.Packages.get(RenderableType.Connector).SetColor(FEMOpt.ConnectorsColor);
    }

    BuildGeometry()
    {
        this.SetStandardColor();

        for (const x of this.Elements.Cards.values())
        {
            let t = x.GetRenderableType();
            if(!t) { continue; }
    
            let pack = this.Packages.get(t);
            // if(pack.IsBuilt) { continue; }

            pack.Add(x);
        }

        var nodePackage = this.Packages.get(RenderableType.Node);
        if(nodePackage)
        {
            for (const x of this.Nodes.Cards.values())
            {
                nodePackage.Add(x);
            }
        }

        for(const pack of this.Packages.values())
        {
            pack.Build();
            this.BoundingBox.union(pack.BoundingBox);
        }
    }

    UpdateColors(nodal = false) { for(const pack of this.Packages.values()) { pack.UpdateColors(nodal); } }
    UpdateValuesAttribute(flagOnly = false, nodal = false) 
    {
        for(const [key, pack] of this.Packages.entries()) 
        {
            // if(key == RenderableType.Node) { continue; }
            pack.UpdateValuesAttribute(flagOnly, nodal); 
        }
    }
    UpdateDisplacements() 
    {
        for(const [key, pack] of this.Packages.entries()) 
        { 
            pack.UpdateDisplacements(); 
        } 
    }

    SetRenderMode(mode)
    {
        this.RenderMode = mode;
        switch(mode)
        {
            case RenderMode.Standard: this.SetStandardColor(); break;
            case RenderMode.Material:  this.ColorByAdvanced('Property().Material().ID'); break;
            case RenderMode.Property: this.ColorBy('PID'); break;
            case RenderMode.Thickness: this.ColorByAdvanced('Property().GetThickness()'); break;
            case RenderMode.ID: this.ColorBy('ID'); break;
            case RenderMode.Normal: break;
            case RenderMode.Group: break;
            case RenderMode.Results: break;
            case RenderMode.Custom: this.ColorByAdvanced(FEMOpt.CustomModeString); break;
        }

        if(mode != this.RenderMode.Standard)
        {

            UpdateSpectrumView();
        }
    }

    ColorBy(propName)
    {
        let props = [];
        let max = -Number.MAX_VALUE;
        let min = Number.MAX_VALUE;

        for(const [id, e] of this.Elements.Cards.entries())
        {
            if(!e.IsVisible()) { continue; }
            let v = e[propName];
            if(!v || v.call) { continue; }
            if(v < min) { min = v; }
            if(v > max) { max = v; }
            props[id] = v;
            e.AttachedValue = v;
        }

        if(props.size == 0) { return; }

        Spectrum.SetRange(min, max);

        for(const [id, e] of this.Elements.Cards.entries())
        {
            let c = Spectrum.GetColor(props[id]);
            e.RenderInfo.R = c.R;
            e.RenderInfo.G = c.G;
            e.RenderInfo.B = c.B;
        }

        for(const pack of this.Packages.values())
        {
            pack.UpdateColors();
        }
    }

    ColorByAdvanced(path)
    {
        let props = [];
        let max = -Number.MAX_VALUE;
        let min = Number.MAX_VALUE;

        let tokens = path.split('.');

        if(tokens.length == 0) { return; }
        if(tokens.length == 1)
        {
            let s = tokens[0].length;
            if(s == 0) { return; }
            let isFunc = tokens[0][s - 1] == ')';
            if(!isFunc)
            {
                this.ColorBy(tokens[0]);
                return;
            }
        }
        
        for(const [id, e] of this.Elements.Cards.entries())
        {
            let prevObj = e;
            for(var i = 0; i < tokens.length; i++)
            {
                if(!prevObj) { break; }
                let token = tokens[i];
                let s = token.length;
                if(s == 0) { continue; } //ignoring empty tokens
                // let isFunc = s > 2 && token.slice(-2) == '()';
                let isFunc = token[s - 1] == ')';

                if(isFunc)
                {
                    let funcName = token.substring(0, s - 2);
                    if(prevObj[funcName])
                    {
                        prevObj = prevObj[funcName]();
                    }
                }
                else
                {
                    prevObj = prevObj[token];
                }
            }

            if(!prevObj || prevObj instanceof Object) { continue; }
            if(prevObj < min) { min = prevObj; }
            if(prevObj > max) { max = prevObj; }
            props[id] = prevObj;
            e.AttachedValue = prevObj;
        }

        if(props.size == 0) { return; }

        Spectrum = ColorSpectrum.Rainbow(min, max);

        for(const [id, e] of this.Elements.Cards.entries())
        {
            let c = Spectrum.GetColor(props[id]);
            e.RenderInfo.R = c.R;
            e.RenderInfo.G = c.G;
            e.RenderInfo.B = c.B;
        }

        for(const pack of this.Packages.values())
        {
            pack.UpdateColors();
        }
    }
}

var CardConstructors = []; var CardDefinitions = []; var OP2CodeToCard = [];
function CARD(c, def, refsDef, op2Def) 
{
    CardConstructors[c.name] = c; 
    if(def)
    {
        def.Name = c.name; 
        c.prototype.GetDefinition = function() { return def; };
        if(def.OP2Code) { OP2CodeToCard[def.OP2Code] = c.name; }
    }
    if(op2Def)
    {
        op2Def.Name = c.name;
        c.prototype.GetOP2Definition = function() { return op2Def; };
        if(op2Def.OP2Code) { OP2CodeToCard[op2Def.OP2Code] = c.name; }
    }

    if(refsDef != undefined)
    {
        for(var i = 0; i < refsDef.References.length; i++)
        {
            let ref = refsDef.References[i];
            c.prototype[ref.Name] = function()
            {
                var memberName = '_' + ref.Name;
                if(this[memberName] == undefined)
                {
                    this[memberName] = this.FEM.Get(ref.TargetType, this[ref.FieldName]);
                }
                return this[memberName];
            }
        }
    }
}

const ElementType = { Point: 1, Connector: 2, MPC: 3, Bar: 4, Shell: 5, Solid: 6 };
const ElementTopology = { Point: 1, Line: 2, Tria: 3, Quad: 4, Tetra: 5, Pyra: 6, Penta: 7, Hexa: 8 };

function DefineCard() { return new CardDefinition(); }
function DefineReferences() { return new ReferencesDefinition(); }

const FEMCardType = { ELEMENT: 1, NODE: 2, PROPERTY: 3, MATERIAL: 4, SYSTEM: 5 };

class FEMCard
{
    constructor()
    {
        this.ID = -1;
        this.FEM = null;
        this._IsVisible = true;
        this.IsValid = true;
    }

    SetFEM(fem) { this.FEM = fem; }

    Process()
    {
    }

    IsVisible() { return this._IsVisible && this.FEM.Packages.get(this.GetRenderableType()).IsVisible; }

    ReadFields(fields)
    {
        var def = this.GetDefinition();
        def.Start();
        while(def.Continue())
        {
            var desc = def.Next();
            if(desc.IsEmpty) { fields.MoveToNext(); continue; }

            if(!desc.IsArray)
            {
                var value = fields.Parse(desc.Type);
                if(value != undefined)
                {
                    this[desc.Name] = value;
                }
                else
                {

                }
            }
            else
            {
                this[desc.Name] = [];

                let j0 = desc.IsToEnd ? fields.Pos : 0;
                let j1 = desc.IsToEnd ? fields.Size() - desc.ToEndDistance : desc.ArraySize

                for(var j = j0; j < j1; j++)
                {
                    this[desc.Name].push(fields.Parse(desc.Type));
                }
            }
        }
    }

    ReadBinary(buffer)
    {
        var def = this.GetOP2Definition ? this.GetOP2Definition() : this.GetDefinition();
        def.Start();

        while(def.Continue())
        {
            var desc = def.Next();

            if(!desc.IsArray)
            {
                this[desc.Name] = buffer.Parse(desc.Type);
            }
            else
            {
                this[desc.Name] = [];

                let j1 = desc.IsToEnd ? desc.MaxSize : desc.ArraySize;

                for(var j = 0; j < j1; j++)
                {
                    this[desc.Name].push(buffer.Parse(desc.Type));
                }
            }

            if(def.ReadEntries == def.Pos) { break; }
            if(desc.BytesToSkip) { buffer.Advance(desc.BytesToSkip); }
        }

        if(def.ReadEntries) { buffer.Advance(def.SkipRemainingBytes); }
    }
}

class FEMNode extends FEMCard
{
    constructor()
    {
        super();
        this.Elements = [];
    }

    GetPoints()
    {
        return [this.Pos()];
        // var points = [this.Pos()];
        // return points;
    }

    GetLines() { return NoLines; }
    GetTriangles() { return NoTriangles; }
    GetFaces() { return NoFaces; }
    GetRenderableType() { return RenderableType.Node; }

    Extend(targetType, single = false, req = null, from = null, start = false)
    {
        var objs = [];

        this.IsAttached = true;

        // console.log('Extending node ' + this.ID);

        if(start) { this.CurrentMark = ++GlobalMark; }

        if(targetType == FEMCardType.ELEMENT)
        {
            // var ext = [];
            var localExt = [];
            for(var i = 0; i < this.Elements.length; i++)
            {
                let e = this.Elements[i];
                if(e.IsAttached || req && !req(from ? from : this, e)) { continue; }
                e.IsAttached = true;
                localExt.push(e);
                objs.push(e);
            }

            if(!single)
            {
                while(localExt.length > 0)
                {
                    var ext = [];
                    for(var j = 0; j < localExt.length; j++)
                    {
                        let newExt = localExt[j].Extend(targetType, single, req, from);
                        for(var k = 0; k < newExt.length; k++)
                        {
                            objs.push(newExt[k]);
                            ext.push(newExt[k]);
                        }
                    }
                    localExt = ext;
                }
            }
        }
        // else if(targetType == FEMCardType.NODE)
        // {
        //     for(var i = 0; i < this.Elements.length; i++)
        //     {
        //         let e = this.Elements[i];
        //         let nObjs = e.Extend(targetType, req);
        //         for(var j = 0; j < nObjs.length; j++)
        //         {
        //             objs.push(nObjs[j]);
        //         }
        //     }
        // }

        return objs;
    }

    AllElementsAreHidden()
    {
        for(var i = 0; i < this.Elements.length; i++)
        {
            if(this.Elements[i].IsVisible()) { return false; }
        }
        return true;
    }
}

CARD(class GRID extends FEMNode { constructor() { super(); }
    Process()
    {
        
    }

    Pos()
    {
        if(!this._Pos)
        {
            this._Pos = new Vector3(this.X1, this.X2, this.X3);
            if(this.ReferenceCoordinateSystem()) { this._Pos = this.ReferenceCoordinateSystem().Transform(this._Pos); }
        }
        return this._Pos;
    }

    SetDisp(v) 
    { 
        this._Disp = v;
        if(this.AnalysisCoordinateSystem()) 
        { 
            this._Disp = this.AnalysisCoordinateSystem().Transform(this._Disp, false);
        }
        
    }

}, DefineCard().Int('ID').Int('CP').Float('X1').Float('X2').Float('X3').Int('CD').Int('PS').Int('SEID').OP2(4501, 45, 1),
DefineReferences().System('CP', 'ReferenceCoordinateSystem').System('CD', 'AnalysisCoordinateSystem'));

var GlobalMark = 0;

class FEMElement extends FEMCard
{
    constructor()
    {
        super();
        this.Nodes = [];

        this.RenderInfo = null;
    }

    Process()
    {
        for(var i = 0; i < this.Gi.length; i++)
        {
            var n = this.FEM.GetNode(this.Gi[i]);
            if(!n) 
            {
                this.IsValid = this.MinNodes ? this.Nodes.length >= this.MinNodes : false; 
                // console.log("Element " + this.ID + " is invalid because node " + this.Gi[i] + " cannot be found");
                return; 
            }
            this.Nodes.push(n);
            n.Elements.push(this);
        }

        super.Process();
    }

    IsQuadratic() { return false; }
    GetNodesSize() { return this.Nodes.length; }

    GetPoints()
    {
        var p = [];
        for(var i = 0; i < this.Nodes.length; i++)
        {
            p.push(this.Nodes[i].Pos());
        }
        return p;
    }

    GetLines() { return BarLines; }
    GetTriangles() { return NoTriangles; }
    GetFaces() { return NoFaces; }

    GetCentroid()
    {
        var x = 0.0; var y = 0.0; var z = 0.0;
        for(var i = 0; i < this.Nodes.length; i++)
        {
            let p = this.Nodes[i].Pos();
            x += p.X; y += p.Y; z += p.Z; 
        }
        x /= this.Nodes.length; y /= this.Nodes.length; z /= this.Nodes.length;
        return new Vector3(x, y, z);
    }

    GetSize()
    {
        if(this.Nodes.length < 2) { return 1.0; }
        return this.Nodes[0].Pos().Distance(this.Nodes[1].Pos());
    }

    GetThickness()
    {
        if(this.Property)
        {
            let p = this.Property();
            if(p.GetThickness)
            {
                return p.GetThickness();
            }
        }
    }

    // Hide()
    // {
    //     this.FEM.Packages.get(this.GetRenderableType()).Hide(this);
    // }

    IsMarked() { GlobalMark == this.CurrentMark; }

    Extend(targetType, single = false, req = null, from = null, start = false)
    {
        var objs = [];

        // console.log('Extending element ' + this.ID);

        this.IsAttached = true;
        var indefinite = true;

        if(start) { this.CurrentMark = ++GlobalMark; from = this; objs.push(this); }

        if(targetType == FEMCardType.ELEMENT)
        {
            for(var i = 0; i < this.Nodes.length; i++)
            {
                let n = this.Nodes[i];
                if(n.IsAttached) { continue; }
                let nObjs = n.Extend(targetType, single, req, from);
                for(var j = 0; j < nObjs.length; j++)
                {
                    objs.push(nObjs[j]);
                }
            }
        }
        // else if(targetType == FEMCardType.NODE)
        // {
        //     for(var i = 0; i < this.Nodes.length; i++)
        //     {
        //         let n = this.Nodes[i];
        //         if(n.IsAttached || req && !req(this, n)) { continue; }
        //         objs.push(n);
        //     }
        // }

        if(start)
        {
            for(var i = 0; i < objs.length; i++) 
            {
                 objs[i].IsAttached = false;
                 for(var j = 0; j < objs[i].Nodes.length; j++)
                 {
                     objs[i].Nodes[j].IsAttached = false;
                 }
            }

        }

        return objs;
    }

    IsInContact(x)
    {

    }

    IsParallel(x)
    {

    }

    HasNodalResults()
    {
        for(var i = 0; i < this.Nodes.length; i++)
        {
            if(this.Nodes[i].AttachedValue == undefined || this.Nodes[i].AttachedValue == NoResult) { continue; }
            return true;
        }
        return false;
    }
}

class FEMElement1D extends FEMElement { constructor() { super(); } 
IsQuadratic() { return this.Nodes.length == 3; }
GetElementType() { return ElementType.Bar; }  
GetTopology() { return ElementTopology.Line; }
GetRenderableType() { return RenderableType.Element1D; }}

class FEMElement2D extends FEMElement { constructor() { super(); }
GetElementType() { return ElementType.Shell; }
GetRenderableType() { return RenderableType.Element2D; } }

class FEMElement3D extends FEMElement { constructor() { super(); } 
GetElementType() { return ElementType.Solid; }
GetRenderableType() { return RenderableType.Element3D; } }

class FEMElementTria extends FEMElement2D { constructor() { super(); } 
IsQuadratic() { return this.Nodes.length == 6; }
GetTopology() { return ElementTopology.Tria; }
GetLines() { return this.IsQuadratic() ? Tria6Lines : Tria3Lines; }
GetTriangles() { return this.IsQuadratic() ? Tria6Triangles : Tria3Triangles; }
GetFaces() { return this.IsQuadratic() ? Tria6Faces : Tria3Faces; } }

class FEMElementQuad extends FEMElement2D { constructor() { super(); } 
IsQuadratic() { return this.Nodes.length == 8; }
GetTopology() { return ElementTopology.Quad; } 
GetLines() { return this.IsQuadratic() ? Quad8Lines : Quad4Lines; }
GetTriangles() { return this.IsQuadratic() ? Quad8Triangles : Quad4Triangles; }
GetFaces() { return this.IsQuadratic() ? Quad8Faces : Quad4Faces; }
GetNormal() //TODO
{
    if(this.Normal == undefined)
    {
        let p0 = this.Nodes[0].Pos();
        let p1 = this.Nodes[1].Pos();
        let p2 = this.Nodes[2].Pos();
        let p3 = this.Nodes[3].Pos();
    }
    return this.Normal;
}
}

class FEMElementTetra extends FEMElement3D { constructor() { super(); this.MinNodes = 4; } 
IsQuadratic() { return this.Nodes.length == 10; }
GetTopology() { return ElementTopology.Tetra; }
GetLines() { return this.IsQuadratic() ? Tetra10Lines : Tetra4Lines; }
GetTriangles() { return this.IsQuadratic() ? Tetra10Triangles : Tetra4Triangles; }
GetFaces() { return this.IsQuadratic() ? Tetra10Faces : Tetra4Faces; } }

class FEMElementHexa extends FEMElement3D { constructor() { super(); this.MinNodes = 8; } 
IsQuadratic() { return this.Nodes.length == 20; }
GetTopology() { return ElementTopology.Hexa; }
GetLines() { return this.IsQuadratic() ? Hexa20Lines : Hexa8Lines; }
GetTriangles() { return this.IsQuadratic() ? Hexa20Triangles : Hexa8Triangles; }
GetFaces() { return this.IsQuadratic() ? Hexa20Faces : Hexa8Faces; } }

CARD(class CQUAD4 extends FEMElementQuad { constructor() { super(); } },
DefineCard().Int('ID').Int('PID').Int('Gi').Array(4).Int('MCID').Float('ZOFFS').SkipBytes(4).Int('TFLAG').Float('T1').Float('T2').Float('T3').Float('T4').OP2(2958, 51, 177),
DefineReferences().Property('PID', 'Property'));

CARD(class CTRIA3 extends FEMElementTria { constructor() { super(); } },
DefineCard().Int('ID').Int('PID').Int('Gi').Array(3).Int('MCID').Float('ZOFFS').SkipBytes(8).Int('TFLAG').Float('T1').Float('T2').Float('T3').OP2(5959, 59, 282),
DefineReferences().Property('PID', 'Property'));

CARD(class CTETRA extends FEMElementTetra { constructor() { super(); } },
DefineCard().Int('ID').Int('PID').Int('Gi').Array().ToEnd().Max(10).OP2(5508, 55, 217),
DefineReferences().Property('PID', 'Property'));

CARD(class CHEXA extends FEMElementHexa { constructor() { super(); } },
DefineCard().Int('ID').Int('PID').Int('Gi').Array().ToEnd().Max(20).OP2(7308, 73, 253),
DefineReferences().Property('PID', 'Property'));

CARD(class CBAR extends FEMElement1D { constructor() { super(); } },
DefineCard().Int('ID').Int('PID').Int('Gi').Array(2).Int('G0').OrFloat('X1').Float('X2').Float('X3').String('OFFT').
            Int('PA').Int('PB').Float('W1A').Float('W2A').Float('W3A').Float('W1B').Float('W2B').Float('W3B').OP2(2408, 24, 180).TotalBytes(14 * 4).ReadOnly(4),
DefineReferences().Property('PID', 'Property'));

CARD(class CROD extends FEMElement1D { constructor() { super(); } },
DefineCard().Int('ID').Int('PID').Int('Gi').Array(2).OP2(3001, 30, 48),
DefineReferences().Property('PID', 'Property'));

CARD(class CBEAM extends FEMElement1D  { constructor() { super(); } },
DefineCard().Int('ID').Int('PID').Int('Gi').Array(2).Float('X1').Float('X2').Float('X3').String('OFFT').OrFloat('BIT').
                Int('PA').Int('PB').Float('W1A').Float('W2A').Float('W3A').Float('W1B').Float('W2B').Float('W3B').
                Int('SA').Int('SB').OP2(5408, 54, 261).TotalBytes(16 * 4).ReadOnly(4),
                DefineReferences().Property('PID', 'Property'));

class Connector extends FEMElement  { constructor() { super(); } 
GetElementType() { return ElementType.Connector; }
GetRenderableType() { return RenderableType.Connector; }
GetLines() { return BarLines; } }

CARD(class CBUSH extends Connector { constructor() { super(); } },
DefineCard().Int('ID').Int('PID').Int('Gi').Array(2).Int('G0').OrFloat('X1').Float('X2').Float('X3').OP2(2608, 26, 60).TotalBytes(12 * 4).ReadOnly(4),
DefineReferences().Property('PID', 'Property').Node('G0', 'ReferenceGrid'));
                
class MPC extends FEMElement  { constructor() { super(); } 
GetElementType() { return ElementType.MPC; }
GetRenderableType() { return RenderableType.MPC; } }

CARD(class RBE2 extends MPC { constructor() { super(); } 
Process() { this.Gi.unshift(this.GN); super.Process(); }
GetLines() { return LinesFromFirst(this.Gi.length); }},
DefineCard().Int('ID').Int('GN').Int('CM').Int('Gi').Array().ToEnd(1).Float('ALPHA'),
DefineReferences().Node('GN', 'MasterNode'));

CARD(class RBE3 extends MPC { constructor() { super(); } 
ReadFields(fields)
{
    this.ID = fields.GetInt();
    fields.MoveToNext();
    this.REFGRID = fields.GetInt();
    this.REFC = fields.GetInt();

    this.WTi = []; this.Ci = []; this.Gij = []; this.GMi = []; this.CMi = [];

    let um = false;
    while(fields.Continue())
    {
        let i = fields.GetInt();
        if(um) { if(i) { if(this.GMi.length == this.CMi.length) { this.GMi.push(i); } else { this.CMi.push(i); } continue; } }
        if(i)
        {
            if(this.Ci.length < this.WTi.length) { this.Ci.push(i); }
            else { if(this.Gij.length < this.WTi.length) { this.Gij.push([]); } this.Gij[this.Gij.length - 1].push(i); }
        }
        else
        {
            fields.MoveToPrevious();
            let w = fields.GetFloat();
            if(w) { this.WTi.push(w); } else { let str = fields.GetString().trim(); if(str == 'UM') { um = true; } else if(str == 'ALPHA') { this.ALPHA = fields.GetFloat(); } }
        }
    }
}
Process() 
{
    this.Gi = [];
    this.Gi.push(this.REFGRID);
    for(var i = 0; i < this.Gij.length; i++) { for(var j = 0; j < this.Gij[i].length; j++) this.Gi.push(this.Gij[i][j]); }
    for(var i = 0; i < this.GMi.length; i++) { this.Gi.push(this.GMi[i]); }
    super.Process();
}
GetLines() { return LinesFromFirst(this.Gi.length); }},
undefined, DefineReferences().Node('REFGRID', 'MasterNode'));

function LinesFromFirst(n) { let lines = []; for(var i = 1; i < n; i++) { lines.push([0, i]); } return lines; }

function SplitLines(lines)
{
    var newLines = [];
    var max = 0;
    for(var i = 0; i < lines.length; i++)
    {
        for(var j = 0; j < lines[i].length; j++)
        {
            if(max < lines[i][j]) { max = lines[i][j]; }
        }
    }
    max+=1;

    for(var i = 0; i < lines.length; i++)
    {
        newLines.push([lines[i][0], max+i], [max+i, lines[i][1]]);
    }

    return newLines;
}

const NoLines = [];
const BarLines =[[0, 1]];
const Tria3Lines = [[0, 1], [1, 2], [2, 0]];
const Tria6Lines = SplitLines(Tria3Lines);
const Quad4Lines = [[0, 1], [1, 2], [2, 3], [3, 0]];
const Quad8Lines =  SplitLines(Quad4Lines);
const Tetra4Lines = [[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]];
const Tetra10Lines = SplitLines(Tetra4Lines);
const Hexa8Lines = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 5], [2, 6], [3, 7], [4, 5], [5, 6], [6, 7], [7, 4]];
const Hexa20Lines = SplitLines(Hexa8Lines);

const NoFaces = [];
const Tria3Faces = [[0, 1, 2]];
const Tria6Faces = [[0, 1, 2]]; //TODO
const Quad4Faces = [[0, 1, 2, 3]];
const Quad6Faces = [[0, 1, 2, 3]]; //TODO
const Tetra4Faces = [[1, 0, 2], [0, 1, 3], [0, 3, 2], [1, 2, 3]];
const Tetra10Faces = [[1, 4, 0, 6, 2, 5], [0, 4, 1, 8, 3, 7], [0, 7, 3, 9, 2, 6], [1, 5, 2, 9, 3, 8]];
const Hexa8Faces = [[0, 1, 2, 3], [0, 4, 5, 1], [3, 7, 4, 0], [2, 6, 7, 3], [1, 5, 6, 2], [6, 5, 4, 7]];
const Hexa20Faces = [[0, 8, 1, 9, 2, 10, 3, 11], [0, 8, 1, 13, 5, 16, 4, 12], [3, 11, 0, 12, 4, 19, 7, 15], [2, 10, 3, 15, 7, 18, 6, 14], [1, 9, 2, 14, 6, 17, 5, 13], [5, 16, 4, 19, 7, 18, 6, 17]];

const NoTriangles = [];
const Tria3Triangles = [[0, 1, 2]];
const Tria6Triangles = [[0, 1, 2]]; //TODO
const Quad4Triangles = [[0, 1, 2], [0, 2, 3]];
const Quad8Triangles = [[0, 1, 2], [0, 2, 3]]; //TODO
const Tetra4Triangles = [[1, 0, 2], [0, 1, 3], [0, 3, 2], [1, 2, 3]];
const Tetra10Triangles = [[1, 4, 5], [4, 0, 6], [4, 6, 5], [6, 2, 5], [0, 4, 7], [4, 1, 8], [4, 8, 7], [8, 3, 7], [0, 7, 6], [7, 3, 9], [7, 9, 6], [9, 2, 6], [1, 5, 8], [5, 2, 9], [5, 9, 8], [9, 3, 8]];
const Hexa8Triangles = [[0, 1, 2], [2, 3, 0], [0, 4, 5], [5, 1, 0], [3, 7, 4], [4, 0, 3], [2, 6, 7], [7, 3, 2], [1, 5, 6], [6, 2, 1], [6, 5, 4], [4, 7, 6]];
const Hexa20Triangles = [[0, 8, 11], [8, 1, 9], [9, 2, 10], [8, 9, 11], [9, 10, 11], [0, 8, 12], [8, 1, 13], [13, 5, 16], [16, 4, 12], [8, 13, 12], [13, 16, 12], [3, 11, 15], [11, 0, 12], [12, 4, 19], [19, 7, 15], [11, 12, 15], [12, 19, 15], [2, 10, 14], [10, 3, 15], [15, 7, 18], [18, 6, 14], [10, 15, 14], [15, 18, 14], [1, 9, 13], [9, 2, 14], [14, 6, 17], [17, 5, 13], [9, 14, 13], [14, 17, 13], [5, 16, 17], [16, 4, 19], [19, 7, 18], [18, 6, 17], [16, 19, 17], [19, 18, 17]];


class FEMProperty extends FEMCard
{
    constructor() 
    {
         super();
         this.Dimension = 0;
    }
}

CARD(class PSHELL extends FEMProperty { constructor() { super(); } 
GetThickness() { return this.T; } }, 
DefineCard().Int('ID').Int('MID1').Float('T').Int('MID2').Float('I2T3').Int('MID3').Float('TST').Float('NSM').Float('Z1').Float('Z2').Int('MID4').OP2(2302, 23, 283),
DefineReferences().Material('MID1', 'Material').Material('MID2', 'Material2').Material('MID3', 'Material3').Material('MID4', 'Material4'));

CARD(class PCOMP extends FEMProperty { constructor() { super(); this.Plies = []; } 
ReadFields(fields)
{
    this.T = 0;
    this.ID = fields.GetInt();
    fields.Advance(7);

    while(fields.Continue())
    {
        let matID = fields.GetInt();
        let t = fields.GetFloat();
        let orient = fields.GetFloat();
        fields.MoveToNext();
        this.Plies.push({MatID: matID, Thickness: t, Orientation: orient});
        this.T += t;
    }
}
GetThickness() { return this.T; } },
undefined, DefineReferences().Material('MID1', 'Material').Material('MID2', 'Material2').Material('MID3', 'Material3').Material('MID4', 'Material4'));

class FEMMaterial extends FEMCard
{
    constructor() { super(); }
}

CARD(class MAT1 extends FEMMaterial { constructor() { super(); } }, 
DefineCard().Int('ID').Float('E').Float('G').Float('NU').Float('RHO').Float('A').Float('TREF').Float('GE').
                        Float('ST').Float('SC').Float('SS').Int('MCSID').OP2(103, 1, 77));

CARD(class MAT8 extends FEMMaterial { constructor() { super(); } }, 
DefineCard().Int('ID').Float('E1').Float('E2').Float('NU12').Float('G12').Float('G1Z').Float('G2Z').Float('RHO').
Float('A1').Float('A2').Float('TREF').Float('Xt').Float('Xc').Float('Yt').Float('Yc').Float('S').Float('GE').Float('F12').Float('STRN'));

class FEMCoordinateSystem extends FEMCard
{
    constructor() 
    {
        super(); 
        this.FromTransformations = [];
        this.ToTransformations = [];
    }

    Transform(p0, isPoint = true, from = 0)
    {
        let transformation = this.FromTransformations[from];

        if(!transformation)
        {
            let fromGeometry = CoordGeometry.Global;
            let fromSys = FEM.GetSystem(from);
            if(fromSys) { fromGeometry = fromSys.Geometry(); }

            let to = this.Geometry();
            transformation = Matrix3.Transformation(to.i, to.j, to.k, fromGeometry.i, fromGeometry.j, fromGeometry.k);
            this.FromTransformations[from] = transformation;
        }

        let p1 = transformation.Transform(p0);
        if(isPoint)
        {
            p1 = this.Geometry().Origin.Plus(p1);
        }
        return p1;
    }

    InvTransform(p1, isPoint = true, to = 0)
    {
        var p0 = p1;
        if(isPoint)
        {
            p0 = p0.Minus(this.Geometry().Origin);
        }

        let transformation = this.ToTransformations[to];
        if(!transformation)
        {
            var from = this.Geometry();
            var to = CoordGeometry.Global;
            transformation = Matrix3.Transformation(from.i, from.j, from.k, to.i, to.j, to.k);
            this.ToTransformations[to] = transformation;
        }

        return transformation.Transform(p0);
    }
}

class CylindricalCoord extends FEMCoordinateSystem { constructor() { super(); }
    Transform(p0, isPoint = true, from = 0)
    {
        let px = p0.X * Math.cos(DegreesToRadians(p0.Y));
        let py = p0.X * Math.sin(DegreesToRadians(p0.Y));
        return super.Transform(new Vector3(px, py, p0.Z), isPoint, from);
    }
}

class CoordGeometry
{
    constructor(origin, i, j, k) { this.Origin = origin; this.i = i; this.j = j; this.k = k; }
    static FromPoints(origin, pointOnZAxis, pointOnXZPlane)
    {
        let k = pointOnZAxis.Minus(origin).Unit();
        let j = k.Cross(pointOnXZPlane.Minus(origin)).Unit();
        let i = j.Cross(k);
        return new CoordGeometry(origin, i, j, k);
    }
}

CoordGeometry.Global = new CoordGeometry(new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1));

CARD(class CORD1R extends FEMCoordinateSystem { constructor() { super(); }
Geometry()
{
    if(this._Geometry == undefined)
    {
        let n1 = this.N1();
        let n2 = this.N2();
        let n3 = this.N3();
        if(n1 && n2 && n3)
        {
            this._Geometry = CoordGeometry.FromPoints(n1.Pos(), n2.Pos(), n3.Pos());
        }

    }
    return this._Geometry;
}
}, 
DefineCard().Int('ID').SkipBytes(4 * 2).Int('G1A').Int('G2A').Int('G3A').OP2(1801, 18, 5),
DefineReferences().Node('G1A', 'N1').Node('G2A', 'N2').Node('G3A', 'N3'));

CARD(class CORD2R extends FEMCoordinateSystem { constructor() { super(); }
Geometry()
{
    if(this._Geometry == undefined)
    {
        if(!this.ReferenceSystem())
        {
            this._Geometry = CoordGeometry.FromPoints(new Vector3(this.A1, this.A2, this.A3), 
                                                                new Vector3(this.B1, this.B2, this.B3), 
                                                                new Vector3(this.C1, this.C2, this.C3));
        }
        else
        {
            let origin = this.ReferenceSystem().Transform(new Vector3(this.A1, this.A2, this.A3));
            let pointOnZAxis = this.ReferenceSystem().Transform(new Vector3(this.B1, this.B2, this.B3));
            let pointOnXZPlane = this.ReferenceSystem().Transform(new Vector3(this.C1, this.C2, this.C3));
            this._Geometry = CoordGeometry.FromPoints(origin, pointOnZAxis, pointOnXZPlane);
        }
    }
    return this._Geometry;
}
}, 
DefineCard().Int('ID').SkipBytes(4 * 2).Int('RID').Float('A1').Float('A2').Float('A3').Float('B1').Float('B2').Float('B3').Float('C1').Float('C2').Float('C3').OP2(2101, 21, 8),
DefineReferences().System('RID', 'ReferenceSystem'));

CARD(class CORD2C extends CylindricalCoord { constructor() { super(); }
Geometry()
{
    if(this._Geometry == undefined)
    {
        if(!this.ReferenceSystem())
        {
            this._Geometry = CoordGeometry.FromPoints(new Vector3(this.A1, this.A2, this.A3), 
                                                                new Vector3(this.B1, this.B2, this.B3), 
                                                                new Vector3(this.C1, this.C2, this.C3));
        }
        else
        {
            let origin = this.ReferenceSystem().Transform(new Vector3(this.A1, this.A2, this.A3));
            let pointOnZAxis = this.ReferenceSystem().Transform(new Vector3(this.B1, this.B2, this.B3));
            let pointOnXZPlane = this.ReferenceSystem().Transform(new Vector3(this.C1, this.C2, this.C3));
            this._Geometry = CoordGeometry.FromPoints(origin, pointOnZAxis, pointOnXZPlane);
        }
    }
    return this._Geometry;
}
}, 
DefineCard().Int('ID').SkipBytes(4 * 2).Int('RID').Float('A1').Float('A2').Float('A3').Float('B1').Float('B2').Float('B3').Float('C1').Float('C2').Float('C3').OP2(2001, 20, 9),
DefineReferences().System('RID', 'ReferenceSystem'));


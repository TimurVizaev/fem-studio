//Copyright Timur Vizaev 2014-2024
//
//FEM Studio

class ISelectionManager
{
    constructor()
    {
        this.Hovered = null;

        this.Selected = new Map();
        this.Selected.set(RenderableType.Element0D, new Map());
        this.Selected.set(RenderableType.Element1D, new Map());
        this.Selected.set(RenderableType.Element2D, new Map());
        this.Selected.set(RenderableType.Element3D, new Map());
        this.Selected.set(RenderableType.Connector, new Map());
        this.Selected.set(RenderableType.MPC, new Map());
    }

    SetHovered(obj)
    {
        this.Hovered = obj;
        //console.log("Hovered " + obj.ID);
    }

    ClearHovered()
    {
        this.Hovered = null;
    }

    AddSelected(obj, add = true)
    {
        if(add)
        {
            this.Selected.get(obj.GetRenderableType()).set(obj.ID, obj);
        }
        else
        {
            this.Selected.get(obj.GetRenderableType()).delete(obj.ID);
        }
    }

    // RemoveSelected(obj)
    // {
    //     this.Selected.get(obj.GetRenderableType()).delete(obj.ID);
    // }

    ClearSelected()
    {
        this.Selected.set(RenderableType.Element0D, new Map());
        this.Selected.set(RenderableType.Element1D, new Map());
        this.Selected.set(RenderableType.Element2D, new Map());
        this.Selected.set(RenderableType.Element3D, new Map());
        this.Selected.set(RenderableType.Connector, new Map());
        this.Selected.set(RenderableType.MPC, new Map());
    }

    SetSelected(obj)
    {

    }
}

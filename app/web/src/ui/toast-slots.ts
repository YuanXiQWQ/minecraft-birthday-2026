/** ToastManager's five 32-pixel slots are shared by native recipe and advancement notifications. */
export class ToastSlots {
    owners:object[]=[];
    /** Reserve the first free native row. @param {object} owner Notification identity. @return {number} Row or -1 when full. */
    claim(owner:object):number {
        const held=this.owners.indexOf(owner);if(held>=0)return held;
        for(let i=0;i<5;i++)if(!this.owners[i]){this.owners[i]=owner;return i;}
        return -1;
    }
    /** Release only this notification's row. @param {object} owner Notification identity. */
    release(owner:object):void {const slot=this.owners.indexOf(owner);if(slot>=0)delete this.owners[slot];}
}

/** Timed scene navigation stays reachable through a compact, keyboard-accessible top edge. */
export class NavigationPanel {
    edge: HTMLButtonElement;
    timer: ReturnType<typeof setTimeout> | null = null;
    abort = new AbortController();
    hovered = false;
    disposed = false;

    /** Show scene actions initially and retract five seconds after pointer departure.
     * @param {HTMLElement} panel Existing four-button scene navigation.
     * @param {string} label Localized edge action label.
     */
    constructor(public panel: HTMLElement, label: string) {
        this.edge = document.createElement('button');
        this.edge.className = 'navigation-edge'; this.edge.type = 'button';
        this.edge.setAttribute('aria-label', label); this.edge.setAttribute('aria-controls', panel.id);
        panel.after(this.edge);
        const options = {signal: this.abort.signal};
        panel.addEventListener('pointerenter', () => {this.hovered = true; this.show();}, options);
        panel.addEventListener('pointerleave', () => {this.hovered = false; this.arm();}, options);
        panel.addEventListener('focusin', () => {if(panel.querySelector(':focus-visible'))this.show();}, options);
        panel.addEventListener('focusout', () => this.arm(), options);
        this.edge.addEventListener('pointerenter', () => this.show(), options);
        this.edge.addEventListener('focus', () => this.show(), options);
        this.edge.addEventListener('click', () => {this.show(); panel.querySelector<HTMLButtonElement>('button')?.focus();}, options);
        this.show();
    }

    /** Cancel only this panel's pending retraction. */
    cancel(): void {if(this.timer!==null)clearTimeout(this.timer); this.timer=null;}

    /** Reveal the rounded panel and hide its compact edge. */
    show(): void {
        if(this.disposed)return;
        this.cancel(); this.panel.dataset.expanded='true'; this.panel.inert=false; this.edge.hidden=true;
        this.edge.setAttribute('aria-expanded','true'); this.arm();
    }

    /** Restart the five-second departure interval without collapsing beneath a hovered pointer. */
    arm(): void {
        this.cancel();
        if(this.disposed||this.hovered||this.panel.querySelector(':focus-visible'))return;
        this.timer=setTimeout(()=>{
            this.timer=null; if(this.disposed||this.hovered)return;
            this.panel.dataset.expanded='false'; this.panel.inert=true; this.edge.hidden=false;
            this.edge.setAttribute('aria-expanded','false');
        },5000);
    }

    /** Release timers and document-owned event handlers on page disposal. */
    dispose(): void {this.disposed=true; this.cancel(); this.abort.abort(); this.edge.remove();}
}

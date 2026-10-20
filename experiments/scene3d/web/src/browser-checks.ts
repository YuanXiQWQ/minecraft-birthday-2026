/** Executable in-browser checks exercise the real renderer/raycaster, not screenshots alone. */
import { BoxGeometry, Group, Vector3 } from 'three';
import type { SceneAdapter } from './scene-adapter.ts';
import { change, edges, fixture, place } from './domain.ts';
import type { Layout } from './domain.ts';

/** Run isolated three-dimensional fixtures and restore the user's experiment layout afterwards.
 * @param {SceneAdapter} adapter Actual WebGL2 scene.
 * @param {Layout} original Original logical layout.
 * @param {Function} panelProbe UI gate regression probe.
 * @return {object} Individual assertions, counts, counters and environment.
 */
export function browserChecks(adapter: SceneAdapter, original: Layout, panelProbe: () => boolean): object {
  const results: { name: string; passed: boolean; detail: string }[] = [];
  const originalView=adapter.view;
  /** Record one independently named assertion without hiding subsequent failures.
   * @param {string} name Test identifier.
   * @param {Function} assertion Executable assertion.
   */
  function check(name: string, assertion: () => boolean): void {
    try { const passed = assertion(); results.push({ name, passed, detail: passed ? 'passed' : 'assertion returned false' }); }
    catch (error) { results.push({ name, passed: false, detail: String(error) }); }
  }
  const probe = new Group(); adapter.environment.add(probe);
  try {
    adapter.sync({ schema: 1, nextId: 1, instances: [] });
    const front = adapter.models.part(probe,new BoxGeometry(1,1,1),adapter.models.material('probe',0xb77770),[.5,.5,3.5]);
    front.userData = { id: 'front-wall', role: 'occluder' };
    const back = adapter.models.part(probe,new BoxGeometry(1,1,1),adapter.models.material('probe',0xb77770),[.5,.5,1.5]);
    back.userData = { id: 'rear-device', role: 'device' };
    adapter.camera.position.set(.5,.5,8); adapter.camera.lookAt(.5,.5,0); adapter.camera.updateMatrixWorld(true);
    const canvas = adapter.renderer.domElement, center = [canvas.clientWidth/2, canvas.clientHeight/2];
    adapter.renderOnce();
    check('B01 actual WebGL2 draw', () => adapter.diagnostics().webgl2 && adapter.diagnostics().calls > 0);
    check('B02 perspective projection', () => adapter.camera.isPerspectiveCamera && adapter.camera.projectionMatrix.elements[11] === -1);
    check('B03 nearest noninteractive wall occludes rear device', () => adapter.pick(center[0],center[1])?.id === 'front-wall');
    check('B04 visible block face is +Z', () => JSON.stringify(adapter.pick(center[0],center[1])?.normal) === '[0,0,1]');
    front.removeFromParent(); front.geometry.dispose();
    check('B05 removal exposes rear geometry', () => adapter.pick(center[0],center[1])?.id === 'rear-device');
    adapter.showPreview([0,0,5],'furnace','south',true);
    check('B06 real 3D preview never becomes a pick target', () => adapter.pick(center[0],center[1])?.id === 'rear-device');
    adapter.showPreview(null,'furnace','north',false);
    adapter.camera.position.set(.5,6,1.5); adapter.camera.lookAt(.5,.5,1.5); adapter.camera.updateMatrixWorld(true);
    check('B07 top face hit selects cell above', () => JSON.stringify(adapter.pick(center[0],center[1])?.candidate) === '[0,1,1]');
    adapter.models.release(probe);
    let layout = fixture(); adapter.sync(layout); adapter.setView('Front');
    check('B08 top input / side fuel / bottom output adjacency', () => {
      const links = edges(layout); return links.length === 4 && links.some(e => e.from==='w3' && e.to==='w2' && e.port==='input')
        && links.some(e => e.from==='w4' && e.to==='w2' && e.port==='fuel') && links.some(e => e.from==='w2' && e.to==='w5' && e.port==='output');
    });
    layout = change(layout,'w4','west'); adapter.sync(layout);
    check('B09 rotation invalidates live edge', () => !edges(layout).some(e => e.from==='w4'));
    layout = place(layout,'furnace',[2,0,2],'east'); adapter.sync(layout); const id = `w${layout.nextId-1}`;
    check('B10 model front matches east-facing logical state', () => {
      const p = adapter.objects.get(id)!.getObjectByName('front')!.getWorldPosition(new Vector3()); return p.x >= 3-.00001 && Math.abs(p.z-2.5)<.01;
    });
    layout = change(layout,id,null); adapter.sync(layout);
    check('B11 removed instance has no render or graph reference', () => !adapter.objects.has(id) && !edges(layout).some(e => e.to===id || e.from===id));
    adapter.sync(fixture()); adapter.renderOnce(); const baseline = adapter.diagnostics().geometries;
    for (let i=0;i<12;i++) {
      let dense = fixture(); for (let x=-3;x<=0;x++) dense = place(dense,'furnace',[x,0,2],'west');
      adapter.sync(dense); adapter.renderOnce(); adapter.sync(fixture()); adapter.renderOnce();
    }
    check('B12 twelve geometry churn cycles return to GPU geometry baseline', () => adapter.diagnostics().geometries === baseline);
    check('B13 modal blocks even directly dispatched canvas pointer events', panelProbe);
    check('B14 every observation station stays at eye height',()=>{
      return (['Front','Left','Right'] as const).every(view=>{
        adapter.setView(view); return adapter.camera.position.y===1.62;
      });
    });
    adapter.setView('Front');
    check('B15 default main furnace composes centrally',()=>{
      const p=adapter.project([.5,1.5,.5]);
      return Math.abs(p.x/canvas.clientWidth-.5)<.01 && Math.abs(p.y/canvas.clientHeight-.5)<.1;
    });
    check('B16 off-center mouse ray reaches the workbench',()=>{
      const p=adapter.project([-1.5,.5,.5]);
      return Math.abs(p.x-canvas.clientWidth/2)>20 && adapter.pick(p.x,p.y)?.id==='w1';
    });
    check('B17 each fixture device has a visible surface from an eye station',()=>{
      return fixture().instances.every(instance=>(['Front','Left','Right'] as const).some(view=>{
        adapter.setView(view);
        // Sample interior face points, including the open hopper rim instead of its empty center.
        return [.12,.5,.88].some(x=>[.15,.5,.9].some(y=>[.12,.5,.88].some(z=>{
          const p=adapter.project([instance.cell[0]+x,instance.cell[1]+y,instance.cell[2]+z]);
          return p.x>0&&p.x<canvas.clientWidth&&p.y>0&&p.y<canvas.clientHeight&&adapter.pick(p.x,p.y)?.id===instance.id;
        })));
      }));
    });
  } finally {
    if (probe.parent) adapter.models.release(probe);
    adapter.showPreview(null,'furnace','north',false); adapter.sync(original); adapter.setView(originalView); adapter.renderOnce();
  }
  return { capturedAt: new Date().toISOString(), scope: 'real browser engine checks; trusted physical pointer smoke recorded separately',
    passed: results.filter(r=>r.passed).length, failed: results.filter(r=>!r.passed).length, results, environment: adapter.diagnostics() };
}

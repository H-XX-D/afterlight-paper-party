/** The magic row's first three legacy cells depict circular spirals. Use its
 * separated paper-chip cell instead; no reward becomes a looping head halo.
 */
export function paperEffectFrame(type,time=0,progress){
 const row=({hit:0,dust:1,magic:2,shield:3}[type]??0);
 const frame=row===2?3:Number.isFinite(progress)?Math.min(3,Math.max(0,Math.floor(progress*4))):Math.floor(Math.abs(Number.isFinite(time)?time:0)*12)%4;
 return {row,frame};
}

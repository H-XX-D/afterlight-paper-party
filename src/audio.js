let context, bus, enabled=false, nextNote=0, timer, step=0;
export function isAudioOn(){return enabled}
export async function toggleAudio(){
 if(!context){context=new(window.AudioContext||window.webkitAudioContext)();bus=context.createGain();bus.gain.value=.13;bus.connect(context.destination)}
 await context.resume();enabled=!enabled;
 if(enabled){nextNote=context.currentTime;timer=setInterval(schedule,100)}else{clearInterval(timer)}
 return enabled;
}
function tone(freq,start,duration,type='sine',gain=.2){if(!context||!enabled)return;const osc=context.createOscillator(),g=context.createGain();osc.type=type;osc.frequency.value=freq;g.gain.setValueAtTime(0,start);g.gain.linearRampToValueAtTime(gain,start+.025);g.gain.exponentialRampToValueAtTime(.001,start+duration);osc.connect(g);g.connect(bus);osc.start(start);osc.stop(start+duration+.05)}
function schedule(){while(nextNote<context.currentTime+.3){const notes=[130.81,155.56,196,174.61,130.81,233.08,196,116.54];tone(notes[step%8],nextNote,1.3,'sine',.2);if(step%4===0)tone(notes[step%8]/2,nextNote,2,'triangle',.15);step++;nextNote+=.62}}
export function sound(type='click'){if(!enabled)return;const f=type==='win'?523.25:type==='roll'?220:330;tone(f,context.currentTime,.2,'triangle',.35);if(type==='win'){tone(f*1.25,context.currentTime+.12,.3);tone(f*1.5,context.currentTime+.24,.5)}}

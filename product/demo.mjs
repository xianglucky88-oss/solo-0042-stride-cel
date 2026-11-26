export function demo() {
  return { id:'forge-sweep', duration:850, fps:24, facing:'right', loop:true,
    keys:[{time:0,x:0,y:0,arm:-18},{time:170,x:12,y:-12,arm:-100},{time:330,x:56,y:-25,arm:60},
      {time:515,x:88,y:-7,arm:100},{time:690,x:98,y:0,arm:26},{time:850,x:105,y:0,arm:-18}],
    windows:[{id:'sweep',from:270,to:460,x:18,y:-52,w:66,h:34},{id:'heel',from:510,to:650,x:-15,y:-15,w:45,h:15}],
    events:[{id:'windup',time:130,kind:'effect'},{id:'contact',time:310,kind:'impact'},{id:'land',time:525,kind:'step',sound:true}],
  };
}

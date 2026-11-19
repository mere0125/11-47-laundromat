export function makeNightTales({host, onOpen, onClose, onChange, onSound, getMind, getMachine, onLayouts, onFollow}) {
  const storageKey='11-47-night-notes-v1';
  const initial={sockFound:false,sockReturned:false,bookRead:false,lightOn:true,tokenSeen:false,note:''};
  let state={...initial};
  try {
    const stored=JSON.parse(sessionStorage.getItem(storageKey)||'null');
    if(stored && typeof stored==='object') {
      for(const key of ['sockFound','sockReturned','bookRead','lightOn','tokenSeen']) if(typeof stored[key]==='boolean') state[key]=stored[key];
      if(typeof stored.note==='string') state.note=stored.note.slice(0,180);
    }
  } catch {}
  let active=false;
  let previousFocus=null;
  let closeCallback=null;

  const panel=document.createElement('section');
  panel.className='night-dialogue';
  panel.hidden=true;
  panel.setAttribute('role','dialog');
  panel.setAttribute('aria-modal','true');
  panel.setAttribute('aria-label','A moment in the laundromat');
  panel.innerHTML=`<button class="tale-close" type="button" aria-label="Close conversation">×</button>
    <p class="tale-speaker"></p><h2 tabindex="-1"></h2><div class="tale-lines"></div><div class="tale-actions"></div>`;
  host.append(panel);
  const speaker=panel.querySelector('.tale-speaker');
  const title=panel.querySelector('h2');
  const lines=panel.querySelector('.tale-lines');
  const actions=panel.querySelector('.tale-actions');

  function save(changes) {
    Object.assign(state,changes);
    try {sessionStorage.setItem(storageKey,JSON.stringify(state));}catch{}
    onChange?.({...state});
  }
  function button(label,callback) {
    const control=document.createElement('button');
    control.type='button';
    control.textContent=label;
    control.addEventListener('click',callback);
    actions.append(control);
    return control;
  }
  function paragraph(text) {
    const p=document.createElement('p');
    p.textContent=text;
    lines.append(p);
  }
  function open(by,heading,text,options=[],afterClose=null) {
    previousFocus=active?previousFocus:document.activeElement;
    closeCallback=afterClose;
    active=true;
    speaker.textContent=by;
    title.textContent=heading;
    lines.replaceChildren();
    for(const line of text) paragraph(line);
    actions.replaceChildren();
    for(const option of options) button(option.label,option.action);
    button('Keep walking',close);
    panel.hidden=false;
    host.dataset.reading='true';
    onOpen?.();
    title.focus({preventScroll:true});
  }
  function close() {
    if(!active)return;
    active=false;
    panel.hidden=true;
    host.dataset.reading='false';
    const callback=closeCallback;
    closeCallback=null;
    callback?.();
    onClose?.();
    if(previousFocus?.isConnected && !previousFocus.closest('[hidden]')) previousFocus.focus({preventScroll:true});
    previousFocus=null;
  }
  panel.querySelector('.tale-close').addEventListener('click',close);
  panel.addEventListener('keydown',event=>{
    if(event.key==='Escape') {event.preventDefault();event.stopPropagation();close();return;}
    if(event.key!=='Tab')return;
    const controls=[...panel.querySelectorAll('button,input,textarea')].filter(el=>!el.disabled&&!el.hidden);
    if(!controls.length)return;
    const first=controls[0],last=controls.at(-1);
    if(event.shiftKey && (document.activeElement===first || document.activeElement===title)) {
      event.preventDefault();last.focus();
    } else if(!event.shiftKey && document.activeElement===last) {
      event.preventDefault();first.focus();
    }
  });

  function showBook() {
    save({bookRead:true});
    onSound?.('paper');
    open('The notebook beside the bench','Whoever’s here next',[
      '11:18 — Someone brought the plant back inside. It was getting soaked.',
      '11:39 — Blue sock on the folding table. If it’s yours, its other half is clipped by the window.',
      state.sockReturned ? '11:47 — Two blue socks, together again.' : 'The next line is empty.'
    ],[
      {label:'Leave a line',action:editNote},
      {label:'Look at tomorrow’s sketches',action:()=>{close();onLayouts?.();}}
    ]);
    if(state.note)paragraph(`Your note — ${state.note}`);
  }
  function editNote() {
    actions.replaceChildren();
    const label=document.createElement('label');
    label.textContent='For the next person';
    label.htmlFor='night-guest-note';
    const input=document.createElement('textarea');
    input.id='night-guest-note';
    input.maxLength=180;
    input.rows=2;
    input.value=state.note;
    input.placeholder='A line before you go…';
    lines.append(label,input);
    button('Leave it in the book',()=>{
      const note=input.value.trim().slice(0,180);
      save({note});
      onSound?.('paper');
      showBook();
    });
    button('Close the book',close);
    input.focus();
  }
  function person(id) {
    const mind=getMind(id), phase=mind?.phase || '';
    if(id==='attendant') {
      const machine=getMachine(10);
      const line=machine?.fault
        ? phase==='servicing' ? '“Just the belt. Give me a minute. You can hear the other drums from here.”'
          : '“The red light on Three? I’ll get to it. There’s always one machine with other plans.”'
        : '“Three’s turning again. I’ll leave the next shift a note. The aisle still needs looking at.”';
      open('Night attendant','Still here',[
        line,
        state.sockReturned ? '“Oh, you found the sock. Thank you. Small things go missing in here.”' : '“If you find a blue sock, there’s a little lost-and-found line by the window.”'
      ],[{label:'Watch the rest of the round',action:()=>{close();onFollow?.('attendant');}}]);
      return;
    }
    const names={mere:'Mere',window:'Woman by the window',sleeping:'Man by the bench',bluecoat:'Blue coat',student:'Student',reader:'Reader',scarf:'Red scarf',raincoat:'Yellow raincoat'};
    const busy=phase==='folding'||phase==='loading'||phase==='unloading';
    const quote={
      mere:busy?'“I always lose track of which edge I’ve already folded.”':'“I came in for one load. The rain seems to have settled in.”',
      window:state.sockReturned?'“You found the other one? They belong to my daughter. I was about to give up.”':state.sockFound?'“Oh! The other one’s clipped by the window. Would you put them together?”':'“One tiny blue sock. I’ve checked the drum three times.”',
      sleeping:'“I’m awake. Just listening for the machine to stop.”',
      bluecoat:'“My coat’s still damp. At least the room is warm.”',
      student:'“My phone says the rain stops in ten minutes. It said that ten minutes ago.”',
      reader:'“It’s the same book every Thursday. I only read it while the washing’s on.”',
      scarf:'“I sort everything before I come. Somehow it all gets mixed up again.”',
      raincoat:'“I could’ve waited at home. This is nicer.”'
    }[id] || '“A few more minutes, I think.”';
    const subtitle=busy?'They set the laundry down for a moment.':'A moment between cycles.';
    open(names[id]||'A late arrival',subtitle,[quote]);
  }
  function interact(target) {
    if(active || !target)return;
    if(target.kind==='person'){person(target.personId);return;}
    switch(target.id) {
      case 'blue-sock':
        if(state.sockFound)return;
        save({sockFound:true});
        onSound?.('paper');
        open('On the folding table','One blue sock',[
          'It’s still warm, with a little white stitch at the heel.',
          'Its other half is clipped by the front window. You put this one in your pocket.'
        ]);
        break;
      case 'sock-line':
        if(state.sockFound&&!state.sockReturned){
          save({sockReturned:true});
          onSound?.('paper');
          open('The lost-and-found line','A pair, at last',[
            'You clip the blue sock beside the other one.',
            'The woman in the pink coat notices. She smiles and gives you a small wave.'
          ]);
        } else {
          open('By the window','Things left behind',[
            state.sockReturned?'Two tiny blue socks hang side by side.':'One little blue sock, waiting for its other half.',
            'The tag says, “Forgotten something? It stays here until you come back.”'
          ]);
        }
        break;
      case 'night-book':showBook();break;
      case 'table-lamp':
        save({lightOn:!state.lightOn});
        onSound?.('switch');
        break;
      case 'coin-tray':
        save({tokenSeen:true});
        onSound?.('coin');
        open('A small dish','For the next person',[
          'Two spare coins, a bent hairpin and a handwritten note.',
          '“Short by one coin? Take it. Leave one another night.”'
        ]);
        break;
      case 'umbrella-rack':
        open('By the entrance','Borrow it if you need it',[
          'Three umbrellas. One has a taped handle.',
          'A label on the rack says, “Bring it back when the sun comes out.”'
        ]);
        break;
      case 'soap-dispenser':
        onSound?.('switch');
        open('The soap dispenser','The familiar click',[
          'The faded button still works. Small detergent packets sit behind the glass.',
          'Someone has taped a paper crane to the corner.'
        ]);
        break;
      default:
        if(target.machineIndex!=null) {
          const machine=getMachine(target.machineIndex);
          const status=machine?.fault?'The red light is on. The attendant is on the round.'
            :machine?.running?'The drum turns, slows, then starts in the other direction.'
            :machine?.finished?'The drum has stopped. Its load is ready for its owner.'
            :'The glass is cool. Someone has wiped the handle dry.';
          open(target.label,'Listen for a moment',[status]);
        }
    }
  }
  onChange?.({...state});
  return {interact,close,get active(){return active;},get state(){return {...state};},dispose(){panel.remove();}};
}

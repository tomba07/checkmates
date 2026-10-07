'use client';
import {useState,useEffect,useMemo,useRef} from 'react';
import {Chess, type Square} from 'chess.js';
import {ChevronDown, Check, X, LogOut, Copy} from 'lucide-react';
import {useMaia} from '@/lib/use-maia';
import {usePieceMotion} from '@/lib/use-piece-motion';
import {Slider} from '@/components/ui/slider';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
type Room={id:string;name:string;elo:number;pgn:string;version:number;status:string;owner:string;members:{id:string;name:string}[]};
const pieces:Record<string,string>={wk:'♚',wq:'♛',wr:'♜',wb:'♝',wn:'♞',wp:'♟',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟'};
export default function ChessRoom({user,initialRoom,signInUrl}:{user:{id:string;name:string}|null;initialRoom:string;signInUrl:string}) {
 const [room,setRoom]=useState<Room|null>(null),[elo,setElo]=useState(500),[selected,setSelected]=useState<Square|null>(null),[dialog,setDialog]=useState<'leave'|'create'|'join'|'invite'|'reset'|'start'|'settings'|'moves'|null>(null),[name,setName]=useState('The Sunday Club'),[code,setCode]=useState(initialRoom),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false),[botRetry,setBotRetry]=useState(0),[botError,setBotError]=useState('');
 const [activeRoomId,setActiveRoomId]=useState<string|null>(null);
 const maia=useMaia();
 const refreshEpoch=useRef(0);
 const current=useRef<Room|null>(null); current.current=room;
 const game=useMemo(()=>{const g=new Chess();if(room?.pgn)g.loadPgn(room.pgn);return g},[room?.pgn]);
 const boardRef=useRef<HTMLDivElement|null>(null);
 usePieceMotion(boardRef,game,room?.id,room?.status==='playing');
 const history=game.history(),last=game.history({verbose:true}).at(-1),legal=selected?game.moves({square:selected,verbose:true}).map(m=>m.to):[];
 function checkSession(res:Response) {
   if(res.status===401){
     window.location.replace('/login?returnTo='+encodeURIComponent(window.location.pathname+window.location.search));
     throw new Error('Your session expired. Please log in again.');
   }
 }
 async function api(action:string,data:Record<string,unknown>={}) {const res=await fetch('/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...data})});checkSession(res);const result=await res.json() as {room:Room;error?:string;activeRoomId?:string|null};if(!res.ok){if(result.activeRoomId)setActiveRoomId(result.activeRoomId);throw new Error(result.error||'Could not save. Please try again.')}return result;}
 async function refresh(id?:string) {
   const epoch=refreshEpoch.current;
   const res=await fetch('/api/rooms'+(id?'?id='+encodeURIComponent(id):''));
   checkSession(res);
   const data=await res.json() as {room:Room;rooms:Room[];error?:string;activeRoomId:string|null};
   if(!res.ok)throw new Error(data.error||'Could not load your group.');
   if(epoch!==refreshEpoch.current)return data;
   setActiveRoomId(data.activeRoomId);
   if(id){setRoom(prev=>prev&&prev.id!==id?prev:!prev||data.room.version>=prev.version?data.room:prev);if(current.current?.id===id&&current.current?.version!==data.room.version)setElo(data.room.elo)}
   return data;
 }
 async function act(action:string,data:Record<string,unknown>={}){setBusy(true);setError('');try{const result=await api(action,{id:room?.id,version:room?.version,...data});if(action==='leave'){refreshEpoch.current++;current.current=null;setRoom(null);setBotError('');window.history.replaceState(null,'','/')}if(result.room){setRoom(result.room);setElo(result.room.elo);window.history.replaceState(null,'','/?room='+result.room.id)}setDialog(null);setSelected(null);await refresh();return result;}catch(e){setError((e as Error).message);if(room)refresh(room.id).catch(()=>{});}finally{setBusy(false)}}
 useEffect(()=>{const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options:unknown)=>void}}).modelContext;if(!context)return;const lifecycle=new AbortController();try{context.registerTool({name:'read_chess_position',description:'Read the current shared chess position, legal moves, and game status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:(input:unknown)=>{if(!input||typeof input!=='object'||Object.keys(input).length)throw new Error('Expected an empty object.');const r=current.current;const g=new Chess();if(r?.pgn)g.loadPgn(r.pgn);return {room:r?.name||null,fen:g.fen(),status:r?.status||'no_room',legalMoves:g.moves()}}},{signal:lifecycle.signal})}catch{}return()=>lifecycle.abort()},[]);
 useEffect(()=>{
   if(!user)return;
   let active=true;
   async function initialize(){
     const listing=await refresh();
     if(!active)return;
     const target=listing.activeRoomId||initialRoom;
     if(!target)return;
     const result=listing.activeRoomId ? await refresh(target) : await api('join',{id:target});
     if(!active)return;
     setRoom(result.room);setElo(result.room.elo);
     window.history.replaceState(null,'','/?room='+result.room.id);
     if(initialRoom&&listing.activeRoomId&&initialRoom!==listing.activeRoomId)setError('Leave or finish your current game before joining another.');
   }
   initialize().catch(e=>{if(active)setError(e.message)});
   return()=>{active=false};
 },[]);
 useEffect(()=>{if(!room)return;const id=room.id;const timer=setInterval(()=>refresh(id).catch(e=>setError(e.message)),1800);return()=>clearInterval(timer)},[room?.id]);
 useEffect(() => {
   if (!room || room.status !== 'playing' || game.turn() !== 'b' || game.isGameOver() || maia.status !== 'ready') return;
   let active = true;
   const {id, version, elo} = room;
   setBotError('');
   const timer = window.setTimeout(() => {
     maia.getMove(game.fen(), elo).then(async move => {
       if (!active || current.current?.id !== id || current.current.version !== version || current.current.status !== 'playing') return;
       const result = await api('move', {id, version, from: move.slice(0,2), to: move.slice(2,4), promotion: move[4] || 'q', bot: true});
       if (active && current.current?.id === id) setRoom(prev => !prev || result.room.version >= prev.version ? result.room : prev);
     }).catch(async error => {
       if (!active) return;
       try { await refresh(id); } catch {}
       if (active) setBotError(error.message || 'Could not play Maia’s move. Try again.');
     });
   }, 800);
   return () => { active = false; window.clearTimeout(timer); };
 }, [room?.id, room?.version, room?.status, maia.status, botRetry]);
 async function squareClick(square:Square){if(!room||room.status!=='playing'||game.turn()!=='w'||busy||maia.status!=='ready')return;if(selected===square){setSelected(null);return}if(legal.includes(square)){await act('move',{from:selected,to:square,promotion:'q'});return}setSelected(game.get(square)?.color==='w'?square:null)}
 const ended = room?.status === 'finished' || game.isGameOver();
 const playing = room?.status === 'playing' && !game.isGameOver();
 const checkmate = ended && game.isCheckmate();
 const showBoard = playing;
 useEffect(()=>{if(!playing&&dialog==='moves')setDialog(null)},[playing,dialog]);
 const host = room?.owner === user?.id;
 const anotherGame = !!activeRoomId && activeRoomId !== room?.id;
 const status = !room ? '' : ended
   ? checkmate ? 'Checkmate.' : game.isStalemate() ? 'Draw by stalemate.' : game.isDraw() ? 'Game drawn.' : 'Game finished.'
   : !playing ? 'Ready when you are.'
   : maia.status !== 'ready' ? 'Preparing Maia…'
   : game.turn() === 'b' ? 'Maia is thinking…'
   : game.isCheck() ? 'Your team is in check.' : 'Your team to move.';
 const dialogTitles = {start:'Choose bot strength',leave:'Leave this group?',create:'Create a group',join:'Join a group',invite:'Invite friends',reset:'End this game?',settings:'Bot strength',moves:'Moves'};
 const dialogDescriptions = {start:'Pick Maia’s Elo before starting. It stays fixed for this game.',leave:'Your teammates can keep playing. If you are the last player, the game ends. You can join again with an invite.',create:'Choose a name for your group.',join:'Paste an invite link or room code.',invite:'Anyone with this link can join after signing in.',reset:'This ends the game for everyone in your group.',settings:'Choose the Elo Maia will play at in the next game.',moves:'The moves played in this game.'};
 return (
   <div className="app-shell">
     <header className="topbar">
       <a className="brand" href="/"><span aria-hidden="true">♞</span>checkmates</a>
       {user ? <div className="account"><span>{user.name}</span><button className="text-button" aria-label="Sign out" onClick={async()=>{const res=await fetch('/api/auth/sign-out',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(res.ok)window.location.assign('/');else setError('Could not sign out. Please try again.')}}><LogOut size={16}/></button></div> : <a className="quiet-button" href={signInUrl} target="_top">Log in</a>}
     </header>
     <main className={showBoard?'play-surface':'play-surface lobby-surface'}>
       <h1 className={showBoard?'sr-only':'lobby-title'}>{checkmate ? game.turn()==='b' ? 'Your team wins' : 'Bot wins' : room ? room.name : 'Play together'}</h1>
       {checkmate&&<p className="muted">Checkmate · {room?.name}</p>}
       {!showBoard&&!room&&<p className="muted">Create a group or join your friends.</p>}
       {showBoard&&<><div className="opponent-row">
         {playing ? <span className="quiet-button elo-button">{room.elo.toLocaleString()} Elo</span> : <button className="quiet-button elo-button" onClick={()=>setDialog('settings')} aria-label={`Bot strength: ${elo} Elo`}>{elo.toLocaleString()} Elo <ChevronDown size={14}/></button>}
       </div>
       <div className="board-frame"><div ref={boardRef} className="board" aria-label="Chess board">
         {game.board().flat().map((piece,i)=>{
           const square=('abcdefgh'[i%8]+(8-Math.floor(i/8))) as Square;
           const dark=(Math.floor(i/8)+i%8)%2===1;
           const inCheck=piece?.type==='k'&&piece.color===game.turn()&&game.isCheck();
           return <button key={square} data-square={square} aria-label={`${square}${piece?' '+(piece.color==='w'?'white':'black')+' '+({p:'pawn',r:'rook',n:'knight',b:'bishop',q:'queen',k:'king'}[piece.type]):''}${inCheck?' in check':''}${last?.from===square?', last move started here':last?.to===square?', last move ended here':''}`} aria-pressed={selected===square} className={`square ${dark?'dark':'light'} ${selected===square?'selected':''} ${last?.from===square?'last-move-from':''} ${last?.to===square?'last-move-to':''} ${inCheck?'in-check':''}`} onClick={()=>squareClick(square)}>
             {i%8===0&&<span className="rank">{8-Math.floor(i/8)}</span>}
             {i>=56&&<span className="file">{'abcdefgh'[i%8]}</span>}
             {piece&&<span className="piece-motion"><span className={'piece '+(piece.color==='w'?'white-piece':'black-piece')}>{pieces[piece.color+piece.type]}</span></span>}
             {legal.includes(square)&&<span className={piece?'legal-capture':'legal-dot'}/>}
           </button>;
         })}
       </div></div></>}
       <div className="table-controls">
         <div className="group-identity">
           {room&&showBoard&&<span className="group-name">{room.name}</span>}
           {room&&<div className="member-names" aria-label="Group members">{room.members.map(m=><span key={m.id}>{m.name}{m.id===user?.id?' (you)':''}</span>)}</div>}
         </div>
         <div className="table-actions">
           {room ? <><button className="quiet-button" onClick={()=>setDialog('invite')}>Invite</button>{!playing&&<button className="primary-button" disabled={busy||maia.status!=='ready'||!host||anotherGame} onClick={()=>setDialog('start')}>{ended?'Play again':'Start game'}</button>}</> : <><button className="quiet-button" onClick={()=>setDialog('join')}>Join group</button><button className="primary-button" onClick={()=>setDialog('create')}>Create group</button></>}
         </div>
       </div>
       {room&&<div className="board-status">
         <span role="status" aria-live="polite">{ended?status:maia.status==='error'?<>{maia.message} <button className="text-button" onClick={maia.retry}>Retry</button></>:maia.status!=='ready'?(maia.status==='downloading'?`Loading Maia · ${maia.progress}%`:'Loading Maia…'):status}</span>
         <div className="secondary-actions">{room&&<button className="text-button" onClick={()=>setDialog('leave')}>Leave</button>}{playing&&history.length>0&&<button className="text-button" onClick={()=>setDialog('moves')}>Moves</button>}{playing&&host&&<button className="text-button" onClick={()=>setDialog('reset')}>End game</button>}</div>
       </div>}
       {botError&&playing&&game.turn()==='b'&&<div className="error-banner" role="alert">{botError}<button className="text-button" onClick={()=>{setBotError('');if(maia.status==='error')maia.retry();else setBotRetry(n=>n+1)}}>Retry move</button></div>}
       {anotherGame&&<p className="current-game-notice"><a href={'/?room='+activeRoomId}>Return to your current game</a></p>}{error&&<div className="error-banner" role="alert">{error}<button aria-label="Dismiss error" onClick={()=>setError('')}><X size={16}/></button></div>}
     </main>
     <Dialog open={dialog!==null} onOpenChange={open=>!open&&setDialog(null)}>
       <DialogContent className="room-dialog">
         <DialogTitle>{dialog&&dialogTitles[dialog]}</DialogTitle>
         <DialogDescription>{dialog&&dialogDescriptions[dialog]}</DialogDescription>
         {dialog==='settings'||dialog==='start' ? <>
           <div className="elo-value">{elo.toLocaleString()} <span>Elo</span></div>
           <Slider aria-label="Bot Elo" min={500} max={2400} step={10} value={[elo]} onValueChange={v=>setElo(v[0])} disabled={!!room&&(playing||!host)} className="elo-slider"/>
           <div className="range-labels"><span>500</span><span>2,400</span></div>
           {room&&(playing||!host)&&<p className="muted">{playing?'You can change the strength after this game.':'The group host chooses the strength.'}</p>}
           {dialog==='start' ? <button className="primary-button" disabled={busy||playing||!host||anotherGame||maia.status!=='ready'} onClick={()=>act('start',{elo})}>Start game</button> : <button className="primary-button" onClick={()=>setDialog(null)}>Done</button>}
         </> : dialog==='moves' ? <div className="move-list">{Array.from({length:Math.ceil(history.length/2)},(_,i)=><div className="move-pair" key={i}><span>{i+1}.</span><strong>{history[i*2]}</strong><strong>{history[i*2+1]||'…'}</strong></div>)}</div>
         : !user ? <a className="primary-button" href={signInUrl} target="_top">Log in</a>
         : dialog==='create' ? <form onSubmit={e=>{e.preventDefault();act('create',{name,elo})}}>
           <label htmlFor="group-name">Group name</label><input id="group-name" maxLength={48} required value={name} onChange={e=>setName(e.target.value)}/>
           <button className="primary-button wide" disabled={busy}>Create group</button>
         </form> : dialog==='join' ? <form onSubmit={e=>{e.preventDefault();let id=code.trim();try{id=new URL(id).searchParams.get('room')||id}catch{}act('join',{id})}}>
           <label htmlFor="invite-code">Invite link or code</label><input id="invite-code" required value={code} onChange={e=>setCode(e.target.value)} placeholder="Paste your invitation"/>
           <button className="primary-button wide" disabled={busy}>Join group</button>
         </form> : dialog==='leave' ? <button className="primary-button" disabled={busy} onClick={()=>act('leave')}>Leave group</button> : dialog==='reset' ? <button className="primary-button" disabled={busy} onClick={()=>act('finish')}>End game</button>
         : <><input aria-label="Group invite link" readOnly value={typeof window!=='undefined'?window.location.origin+'/?room='+room?.id:''}/>
           <button className="primary-button" onClick={async()=>{try{await navigator.clipboard.writeText(window.location.origin+'/?room='+room?.id);setCopied(true);setTimeout(()=>setCopied(false),2500)}catch{setError('Copy the link from the field above.')}}}>{copied?<Check size={16}/>:<Copy size={16}/>} {copied?'Copied':'Copy invite link'}</button>
         </>}
         {error&&<p className="dialog-error" role="alert">{error}</p>}
       </DialogContent>
     </Dialog>
   </div>
 );
}

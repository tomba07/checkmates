'use client';
import {useLayoutEffect,useRef,type RefObject} from 'react';
import type {Chess,Square} from 'chess.js';

export function usePieceMotion(board:RefObject<HTMLDivElement|null>,game:Chess,roomId:string|undefined,playing:boolean) {
  const previous=useRef<{fen:string;roomId:string|undefined;playing:boolean}|null>(null);

  useLayoutEffect(()=>{
    const before=previous.current;
    previous.current={fen:game.fen(),roomId,playing};
    const last=game.history({verbose:true}).at(-1);
    const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
    // Animate only a new move from the position already on screen, never a loaded game.
    if(!board.current||!playing||!before?.playing||before.roomId!==roomId||!last||last.before!==before.fen||reducedMotion.matches)return;

    const moves:{from:Square;to:Square}[]=[last];
    const rank=last.color==='w'?'1':'8';
    if(last.flags.includes('k'))moves.push({from:`h${rank}` as Square,to:`f${rank}` as Square});
    if(last.flags.includes('q'))moves.push({from:`a${rank}` as Square,to:`d${rank}` as Square});
    const animations:Animation[]=[];
    const squares:HTMLElement[]=[];
    const distance=Math.hypot(last.from.charCodeAt(0)-last.to.charCodeAt(0),Number(last.from[1])-Number(last.to[1]));
    const duration=Math.min(520,340+distance*28);

    for(const move of moves){
      const square=board.current.querySelector<HTMLElement>(`[data-square="${move.to}"]`);
      const carrier=square?.querySelector<HTMLElement>('.piece-motion');
      const piece=carrier?.querySelector<HTMLElement>('.piece');
      if(!square||!carrier||!piece)continue;
      const x=(move.from.charCodeAt(0)-move.to.charCodeAt(0))*100;
      const y=(Number(move.to[1])-Number(move.from[1]))*100;
      square.classList.add('piece-in-flight');
      squares.push(square);
      const glide=carrier.animate([
        {transform:`translate(${x}%,${y}%)`},
        {transform:'translate(0,0)'},
      ],{duration,easing:'cubic-bezier(.42,0,.18,1)'});
      const lift=piece.animate([
        {transform:'translateY(-1px) scale(1)',filter:'drop-shadow(0 0 0 transparent)',offset:0},
        {transform:'translateY(-12%) scale(1.1)',filter:'drop-shadow(0 9px 5px #172b3040)',offset:.24},
        {transform:'translateY(-12%) scale(1.1)',filter:'drop-shadow(0 9px 5px #172b3040)',offset:.68},
        {transform:'translateY(0) scale(.98)',filter:'drop-shadow(0 1px 1px #172b3020)',offset:.91},
        {transform:'translateY(-1px) scale(1)',filter:'drop-shadow(0 0 0 transparent)',offset:1},
      ],{duration,easing:'ease-in-out'});
      animations.push(glide,lift);
      glide.onfinish=()=>square.classList.remove('piece-in-flight');
    }
    const cancel=()=>{
      animations.forEach(animation=>animation.cancel());
      squares.forEach(square=>square.classList.remove('piece-in-flight'));
    };
    reducedMotion.addEventListener('change',cancel);
    return ()=>{cancel();reducedMotion.removeEventListener('change',cancel);};
  },[board,game,roomId,playing]);
}

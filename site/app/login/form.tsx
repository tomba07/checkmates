'use client';
import {useState} from 'react';
export default function LoginForm({returnTo,token,initialError}:{returnTo:string;token:string;initialError:string}) {
 const [mode,setMode]=useState<'login'|'signup'|'forgot'|'reset'>(token?'reset':'login');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(initialError),[message,setMessage]=useState('');
 async function submit(e:React.FormEvent) {
  e.preventDefault();setBusy(true);setError('');setMessage('');
  try {
   const callbackURL=new URL(returnTo,window.location.origin).href;
   const path=mode==='login'?'sign-in/email':mode==='signup'?'sign-up/email':mode==='forgot'?'request-password-reset':'reset-password';
   const body=mode==='reset'?{token,newPassword:password}:mode==='forgot'?{email,redirectTo:window.location.origin+'/login'}:{email,password,callbackURL,...(mode==='signup'?{name:email.split('@')[0]}:{})};
   const res=await fetch('/api/auth/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const result=await res.json() as {message?:string};
   if(!res.ok)throw new Error(result.message||'Please try again.');
   if(mode==='login')window.location.assign(returnTo);
   else if(mode==='signup')setMessage('Check your email to verify your account, then you can play.');
   else if(mode==='forgot')setMessage('If that email has an account, a password-reset link is on its way.');
   else {setMode('login');setPassword('');window.history.replaceState(null,'','/login');setMessage('Password updated. Log in with your new password.');}
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 function switchMode(next:typeof mode){setMode(next);setError('');setMessage('');setPassword('');}
 return <div className="app-shell"><header className="topbar"><a className="brand" href="/"><span aria-hidden="true">♞</span>checkmates</a></header>
 <main className="auth-panel"><h1>{mode==='login'?'Welcome back':mode==='signup'?'Create an account':mode==='forgot'?'Reset your password':'Choose a new password'}</h1>
 <form onSubmit={submit}>
 {mode!=='reset'&&<><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></>}
 {mode!=='forgot'&&<><label htmlFor="password">Password</label><input id="password" type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='login'?1:10} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/>{mode!=='login'&&<p className="muted">At least 10 characters.</p>}</>}
 {error&&<p className="dialog-error" role="alert">{error}</p>}
 {message&&<p role="status">{message}</p>}
 <button className="primary-button wide" disabled={busy}>{busy?'Please wait…':mode==='login'?'Log in':mode==='signup'?'Create account':mode==='forgot'?'Send reset link':'Save password'}</button>
 </form>
 <div className="auth-links">{mode==='login'?<><button className="text-button" onClick={()=>switchMode('forgot')}>Forgot password?</button><button className="text-button" onClick={()=>switchMode('signup')}>Create an account</button></>:<button className="text-button" onClick={()=>switchMode('login')}>Back to login</button>}</div>
 </main></div>;
}

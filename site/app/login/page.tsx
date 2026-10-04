import LoginForm from './form';
import {getCurrentUser} from '@/lib/current-user';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{returnTo?:string;token?:string;error?:string}>}) {
  const query=await searchParams;
  let returnTo='/';
  try {const url=new URL(query.returnTo||'/', 'https://checkmates.local');if(url.origin==='https://checkmates.local'&&url.pathname==='/')returnTo=url.pathname+url.search;}catch{}
  if(!query.token&&!query.error&&await getCurrentUser())redirect(returnTo);
  return <LoginForm returnTo={returnTo} token={query.token||''} initialError={query.error?'This link is invalid or has expired. Please request a new one.':''}/>;
}

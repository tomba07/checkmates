import LoginForm from './form';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{returnTo?:string;token?:string;error?:string}>}) {
  const query=await searchParams;
  let returnTo='/';
  try {const url=new URL(query.returnTo||'/', 'https://checkmates.local');if(url.origin==='https://checkmates.local')returnTo=url.pathname+url.search;}catch{}
  return <LoginForm returnTo={returnTo} token={query.token||''} initialError={query.error?'This link is invalid or has expired. Please request a new one.':''}/>;
}

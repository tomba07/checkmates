import {headers} from 'next/headers';
import {getAuth} from './auth';
export async function getCurrentUser() {
  const session=await getAuth().api.getSession({headers:await headers()});
  if(!session?.user.emailVerified)return null;
  return {userId:session.user.id,email:session.user.email,fullName:session.user.name};
}

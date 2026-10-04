import { getCurrentUser } from '@/lib/current-user';
import { redirect } from 'next/navigation';
import ChessRoom from './room';
export const dynamic = 'force-dynamic';
export default async function Home({searchParams}: {searchParams: Promise<{room?: string}>}) {
 const query=await searchParams; const user=await getCurrentUser();
 const signInUrl='/login?returnTo='+encodeURIComponent(query.room ? '/?room='+encodeURIComponent(query.room):'/');
 if(!user)redirect(signInUrl);
 return <ChessRoom user={{id:user.userId,name:user.fullName || user.email.split('@')[0]}} initialRoom={query.room || ''} signInUrl={signInUrl} />;
}

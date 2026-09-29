import { getChatGPTUser, chatGPTSignInPath } from './chatgpt-auth';
import ChessRoom from './room';
export const dynamic = 'force-dynamic';
export default async function Home({searchParams}: {searchParams: Promise<{room?: string}>}) {
 const query=await searchParams; const user=await getChatGPTUser();
 return <ChessRoom user={user ? {id:user.userId,name:user.fullName || user.email.split('@')[0]} : null} initialRoom={query.room || ''} signInUrl={chatGPTSignInPath(query.room ? '/?room='+encodeURIComponent(query.room):'/')} />;
}

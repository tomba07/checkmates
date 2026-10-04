import { betterAuth } from 'better-auth';
import {getDatabase} from '@/db/sqlite';
import {getAuthBaseURL} from './auth-origins';
const env=process.env;

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {return instance ??= createAuth();}
function createAuth() {
  if (!env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) throw new Error('Authentication is not configured.');
  return betterAuth({
    appName: 'Checkmates',
    baseURL: getAuthBaseURL(),
    secret: env.BETTER_AUTH_SECRET,
    database: getDatabase(),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 1,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 1800,
      sendResetPassword: async ({user,url}) => sendEmail(user.email,'Reset your Checkmates password',url,'Choose a new password. This link expires in 30 minutes.'),
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 3600,
      sendVerificationEmail: async ({user,url}) => sendEmail(user.email,'Verify your Checkmates email',url,'Confirm your email to start playing. This link expires in one hour.'),
    },
    session: {expiresIn: 60*60*24*30, updateAge: 60*60*24},
    rateLimit: {enabled:true,storage:'database',window:60,max:60,customRules:{
      '/sign-in/email':{window:60,max:5},
      '/sign-up/email':{window:60,max:3},
      '/request-password-reset':{window:60,max:3},
      '/send-verification-email':{window:60,max:3},
    }},
    advanced: {ipAddress:{ipAddressHeaders:['x-real-ip']}},
  });
}

async function sendEmail(to:string,subject:string,url:string,message:string) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error('Email delivery is not configured.');
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},
    body:JSON.stringify({from:env.EMAIL_FROM,to:[to],subject,text:`${message}\n\n${url}\n\nIf you did not request this, you can ignore this email.`}),
  });
  if(!response.ok) throw new Error('Email could not be sent. Please try again.');
}

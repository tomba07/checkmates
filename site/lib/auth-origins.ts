export function getAuthOrigins() {
  const configured=new URL(process.env.BETTER_AUTH_URL!);
  if(!['localhost','127.0.0.1'].includes(configured.hostname))return [configured.origin];
  return ['localhost','127.0.0.1'].map(host=>{
    const url=new URL(configured);
    url.hostname=host;
    return url.origin;
  });
}

export function getAuthBaseURL() {
  const origins=getAuthOrigins();
  if(origins.length===1)return origins[0];
  return {
    allowedHosts:origins.map(origin=>new URL(origin).host),
    protocol:new URL(origins[0]).protocol==='http:'?'http' as const:'https' as const,
    fallback:process.env.BETTER_AUTH_URL!,
  };
}

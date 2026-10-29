export const preview=new URLSearchParams(window.location.search).get('preview')==='1';
export class ApiError extends Error {constructor(public code:string,public status=0){super(code)}}
export async function api<T>(path:string,options:{method?:string;body?:unknown;signal?:AbortSignal;key?:string}={}):Promise<T>{
 if(preview){const {demoRequest}=await import('./demo');return await demoRequest(path,options.method??'GET',options.body,options.key) as T}
 let response:Response;
 try{response=await fetch('/api'+path,{method:options.method??'GET',credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.key?{'Idempotency-Key':options.key}:{})},body:options.body===undefined?undefined:JSON.stringify(options.body),signal:options.signal})}catch(error){if(error instanceof Error&&error.name==='AbortError')throw error;throw new ApiError('network')}
 if(response.status===204)return undefined as T;
 const data=await response.json().catch(()=>null) as {error?:{code?:string}}|null;
 if(!response.ok)throw new ApiError(data?.error?.code??'error',response.status);
 if(data===null)throw new ApiError('error');return data as T;
}

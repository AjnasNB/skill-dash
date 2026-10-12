const details = { type:'object',additionalProperties:false,properties:{repository:{type:'string',maxLength:300,description:'Public GitHub repository URL. Required for a skill.'},skillPath:{type:'string',maxLength:300,description:'Relative folder containing SKILL.md; use . for the root. Required for a skill.'},compatibility:{type:'string',maxLength:500},prerequisites:{type:'string',maxLength:1000},installation:{type:'string',maxLength:3000}} };
export const submissionSchema = {
 '$schema':'https://json-schema.org/draft/2020-12/schema',
 title:'SkillDash owner-authorized submission',type:'object',additionalProperties:false,
 required:['type','name','tagline','description','website','category','pricing','rights'],
 properties:{type:{enum:['skill','product','chatbot','plugin','library','mcp','tool']},name:{type:'string',minLength:2,maxLength:80},tagline:{type:'string',minLength:10,maxLength:140},description:{type:'string',minLength:50,maxLength:5000},website:{type:'string',format:'uri',maxLength:500,description:'Public HTTPS URL without credentials.'},sourceUrl:{type:'string',maxLength:500},category:{enum:['Development','Design','AI & agents','Marketing','Data & research','Cloud & DevOps','Security','Writing','Product & business','Documents','Automation','Video & audio']},pricing:{enum:['Free','Open source','Freemium','Paid']},rights:{const:true,description:'The owner authorized publication of these public details.'},contactEmail:{type:'string',format:'email',maxLength:254,description:'Private. Must match the verified account email; defaults to that email.'},phone:{type:'string',maxLength:40,description:'Optional and private. No format or ownership verification.'},agentDetails:details},
 allOf:[{if:{properties:{type:{const:'skill'}},required:['type']},then:{required:['agentDetails'],properties:{agentDetails:{...details,required:['repository','skillPath']}}}}],
 'x-endpoint':'https://skills.maqamagent.com/api/community/listings',
 'x-authentication':'Verified owner email-link session. Discovery is public; submissions require owner authorization.',
 'x-review':'Pending until reviewer approval. Reviewer defines agent compatibility and usage instructions before publication.',
 'x-notifications':'Submission receipt and approved/rejected review outcomes go to the verified owner email.'
};

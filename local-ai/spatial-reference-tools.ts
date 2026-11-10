import { z } from './editor-src/node_modules/zod/index.js'
import { registerOperationTool } from './editor-src/packages/mcp/dist/tools/shared-tools.js'
import { furnitureReferenceFrame, relativeWallDecision, calibrateFurnitureFront } from './spatial-reference.mjs'

const subjectId = z.string().min(1).describe('现有家具实例ID；从场景工具读取，不是资产ID')
const referenceFrame = z.enum(['use_direction','facing_front','world']).describe('必填：use_direction沿家具使用方向（座椅坐姿）；facing_front站在家具正面看它；world为右+X、前-Z的明确世界轴。镜头相对方向不受支持。')
export const SPATIAL_CONTRACTS = [
  { name:'spatial_get_furniture_frame',title:'Read furniture reference frame',
    description:'读取家具的可靠正面来源、承托链和建筑变换，以及前后左右的楼层/世界向量。未知正面返回needs_calibration，不把rotation=0当作已知朝向。只读。',input:{subjectId,referenceFrame} },
  { name:'spatial_resolve_relative_wall',title:'Resolve a furniture-relative wall',
    description:'编辑家具前后左右的墙之前必须调用。明确参照系，按家具方向射线解析当前房间第一边界，返回候选墙、排除/选择依据、墙段范围、推荐wallId/t及场景指纹。歧义、未知正面或曲墙会拒绝确定目标。只读，不创建门窗。',
    input:{subjectId,referenceFrame,relation:z.enum(['front','back','left','right']),roomId:z.string().optional()} },
  { name:'spatial_set_furniture_front',title:'Calibrate furniture front without moving it',
    description:'仅在用户明确给出模型本地正面轴时保存语义标定；不移动、旋转或重新归属家具，不修改承托关系。不得用模型猜测冒充用户确认。资产替换会使旧标定失效。',
    input:{subjectId,frontAxis:z.enum(['+X','-X','+Z','-Z']),confirmedByUser:z.literal(true),evidenceQuote:z.string().min(1).max(500)} },
] as const

export function registerSpatialReferenceTools(server:any, operations:any) {
  for (const contract of SPATIAL_CONTRACTS) registerOperationTool(server,operations,{
    contract,
    operation:(nodes:any,input:any)=>contract.name==='spatial_set_furniture_front'
      ? calibrateFurnitureFront(nodes,input)
      : { result: contract.name==='spatial_get_furniture_frame' ? furnitureReferenceFrame(nodes,input) : relativeWallDecision(nodes,input) },
    annotations:{readOnlyHint:contract.name!=='spatial_set_furniture_front',destructiveHint:false,idempotentHint:true,openWorldHint:false},
  })
}

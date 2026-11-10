export function fixture() {
  const nodes = {
    site_s:{id:'site_s',type:'site',children:['building_b']},
    building_b:{id:'building_b',type:'building',parentId:'site_s',position:[0,0,0],rotation:[0,0,0]},
    level_l:{id:'level_l',type:'level',parentId:'building_b'},
    zone_r:{id:'zone_r',type:'zone',name:'Room',spaceRole:'room',parentId:'level_l',polygon:[[0,0],[4,0],[4,3],[0,3]],boundaryWallIds:['wall_1','wall_2','wall_3','wall_4']},
    item_sofa:{id:'item_sofa',type:'item',name:'Sofa',parentId:'level_l',position:[2,0,1.5],rotation:[0,0,0],scale:[1,1,1],metadata:{},children:[],asset:{id:'sofa',src:'/items/sofa/model.glb',source:'library',dimensions:[2.5,.8,1.5],rotation:[0,0,0],scale:[1,1,1]}},
  }
  const points=[[0,0],[4,0],[4,3],[0,3]]
  for(let i=0;i<4;i++) nodes['wall_'+(i+1)]={id:'wall_'+(i+1),type:'wall',name:'Wall '+(i+1),parentId:'level_l',start:points[i],end:points[(i+1)%4],thickness:.15,height:2.6,curveOffset:0}
  return nodes
}

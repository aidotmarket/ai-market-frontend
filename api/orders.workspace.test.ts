import {expect,it,vi} from 'vitest';
const client=vi.hoisted(() => ({get:vi.fn()}));
vi.mock('./client',() => ({api:client}));
import {getOrder} from './orders';
it('uses the stored purchase title and cents for Workspace order display',async () => {
  client.get.mockResolvedValue({data:{id:'order-1',workspace_delivery:true,amount_cents:2530,listing_snapshot:{title:'Approved retail'},status:'delivered'}});
  expect(await getOrder('order-1')).toMatchObject({amount:25.3,listing_title:'Approved retail',status:'delivered'});
  const legacy={id:'order-2',amount:10,listing_title:'Legacy'};
  client.get.mockResolvedValue({data:legacy});
  expect(await getOrder('order-2')).toEqual(legacy);
});

import {expect,it,vi} from 'vitest';
const client=vi.hoisted(() => ({get:vi.fn()}));
vi.mock('./client',() => ({api:client}));
import {getMyOrders,getOrder} from './orders';
it('displays list amounts from backend cents while preserving legacy amounts and purchase access',async () => {
  const orders=[
    {id:'order-1',amount_cents:2530,status:'delivered',purchased_version_id:'version-1',access_expires_at:'2026-09-10T12:00:00Z'},
    {id:'order-2',amount_cents:0,amount:10},
    {id:'order-3',amount:12.5},
  ];
  client.get.mockResolvedValue({data:orders});
  expect(await getMyOrders()).toEqual([
    {...orders[0],amount:25.3},
    {...orders[1],amount:0},
    orders[2],
  ]);
  expect(client.get).toHaveBeenLastCalledWith('/orders/mine');
});
it('uses the stored purchase title and cents for Workspace order display',async () => {
  client.get.mockResolvedValue({data:{id:'order-1',workspace_delivery:true,amount_cents:2530,listing_snapshot:{title:'Approved retail'},status:'delivered'}});
  expect(await getOrder('order-1')).toMatchObject({amount:25.3,listing_title:'Approved retail',status:'delivered'});
  const legacy={id:'order-2',amount:10,listing_title:'Legacy'};
  client.get.mockResolvedValue({data:legacy});
  expect(await getOrder('order-2')).toEqual(legacy);
});

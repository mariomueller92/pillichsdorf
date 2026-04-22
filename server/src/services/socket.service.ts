import { getIo } from '../socket/index.js';

export function emitOrderNew(target: 'kueche' | 'schank', data: any): void {
  getIo().to(target).emit('order:new', data);
}

export function emitOrderUpdated(target: 'kueche' | 'schank', data: any): void {
  getIo().to(target).emit('order:updated', data);
}

export function emitOrderCancelled(target: 'kueche' | 'schank', data: any): void {
  getIo().to(target).emit('order:cancelled', data);
}

export function emitOrderItemReady(waiterId: number, data: any): void {
  getIo().to(`kellner:${waiterId}`).emit('order:item_ready', data);
}

export function emitTableStatusChanged(data: any): void {
  getIo().emit('table:status_changed', data);
}

export function emitTableMerged(data: any): void {
  getIo().emit('table:merged', data);
}

export function emitBillSettled(data: any): void {
  getIo().emit('bill:settled', data);
}

export function emitProductAvailabilityChanged(data: any): void {
  getIo().emit('product:availability_changed', data);
}

export function emitOrderMovedToTable(data: any): void {
  getIo().emit('order:moved_to_table', data);
}

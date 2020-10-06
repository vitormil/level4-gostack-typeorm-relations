import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Product from '../../products/infra/typeorm/entities/Product';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);
    if (!customer) {
      throw new AppError('Customer not found');
    }

    const existentProducts = await this.productsRepository.findAllById(
      products,
    );
    if (!existentProducts.length) {
      throw new AppError('Could not find any product with the given ids');
    }

    const existenProductsIds = existentProducts.map(product => product.id);

    const checkInexistentProducts = products.filter(
      product => !existenProductsIds.includes(product.id),
    );
    if (checkInexistentProducts.length) {
      throw new AppError(
        `Could not find product ${checkInexistentProducts.join(', ')}`,
      );
    }
    if (checkInexistentProducts.length) {
      throw new AppError(
        'The order includes products not available at this time. Please try again.',
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: this.getProductPrice(product.id, existentProducts),
    }));

    const quantityUpdate = serializedProducts.map(orderProduct => ({
      id: orderProduct.product_id,
      quantity:
        this.getProductQuantity(orderProduct.product_id, existentProducts) -
        orderProduct.quantity,
    }));

    const outOfStockProducts = quantityUpdate.filter(
      product => product.quantity < 0,
    );
    if (outOfStockProducts.length) {
      throw new AppError(
        `The available quantity is less than requested. Please try again. ${outOfStockProducts.map(
          order => `(id: ${order.id})`,
        )}`,
      );
    }

    const order = await this.ordersRepository.create({
      customer,
      products: serializedProducts,
    });

    await this.productsRepository.updateQuantity(quantityUpdate);

    return order;
  }

  getProductPrice(product_id: string, products: Product[]): number {
    const product = products.find(p => p.id === product_id);
    if (!product) {
      throw new AppError('Product not found');
    }

    return product.price;
  }

  getProductQuantity(product_id: string, products: Product[]): number {
    const product = products.find(p => p.id === product_id);
    if (!product) {
      throw new AppError('Product not found');
    }

    return product.quantity;
  }
}

export default CreateOrderService;

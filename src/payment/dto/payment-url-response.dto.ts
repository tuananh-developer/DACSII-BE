import { ApiProperty } from '@nestjs/swagger';

export class PaymentUrlResponseDto {
  @ApiProperty({ example: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=...' })
  url!: string;
}

import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { Field, ObjectType } from "type-graphql";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  email!: string;

  greet(): string {
    return this.name;
  }

  display(): string {
    return this.email;
  }
}

@ObjectType()
export class UserDto {
  @Field() name!: string;
  @Field() email!: string;
}

export class PlainDto {
  name = "";
  email = "";
}

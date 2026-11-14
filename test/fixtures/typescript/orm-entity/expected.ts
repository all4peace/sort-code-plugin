import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { Field, ObjectType } from "type-graphql";

export class PlainDto {
  email = "";
  name = "";
}

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  email!: string;

  display(): string {
    return this.email;
  }

  greet(): string {
    return this.name;
  }
}

@ObjectType()
export class UserDto {
  @Field() name!: string;
  @Field() email!: string;
}

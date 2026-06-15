import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as docker from "@pulumi/docker";
import * as random from "@pulumi/random";

interface PostgresOutputs {
  provider: pulumi.Output<string>;
  host: pulumi.Output<string>;
  port: pulumi.Output<number>;
  db_name: pulumi.Output<string>;
  master_username: pulumi.Output<string>;
  master_password: pulumi.Output<string>;
  connection_string: pulumi.Output<string>;
  arn: pulumi.Output<string>;
  endpoint: pulumi.Output<string>;
}

const config = new pulumi.Config();
const providerType = config.require("provider");
const dbName = config.get("db_name") ?? "devops_agentic";
const dbUser = config.get("db_user") ?? "devops_ai";
const dbPort = config.getNumber("db_port") ?? 5432;
const dbVersion = config.get("db_version") ?? "16";

let outputs: PostgresOutputs;

if (providerType === "rds") {
  const password = new random.RandomPassword("db-password", {
    length: 24,
    special: false,
  });

  const subnetIds = config.getObject<string[]>("subnet_ids") ?? [];
  const vpcId = config.get("vpc_id") ?? undefined;
  const instanceClass = config.get("instance_class") ?? "db.t3.medium";
  const allocatedStorage = config.getNumber("allocated_storage") ?? 20;
  const multiAz = config.getBoolean("multi_az") ?? false;
  const vpcCidr = config.get("vpc_cidr") ?? "10.0.0.0/16";

  const sg = new aws.ec2.SecurityGroup("postgres-sg", {
    vpcId: vpcId,
    description: "Security group for PostgreSQL RDS",
    ingress: [{
      protocol: "tcp",
      fromPort: dbPort,
      toPort: dbPort,
      cidrBlocks: [vpcCidr],
    }],
    egress: [{
      protocol: "-1",
      fromPort: 0,
      toPort: 0,
      cidrBlocks: [vpcCidr],
    }],
  });

  const subnetGroup = new aws.rds.SubnetGroup("postgres-subnet-group", {
    subnetIds: subnetIds,
    description: "Subnet group for PostgreSQL RDS",
  });

  const instance = new aws.rds.Instance("postgres", {
    engine: "postgres",
    engineVersion: dbVersion,
    instanceClass: instanceClass,
    allocatedStorage: allocatedStorage,
    dbName: dbName,
    username: dbUser,
    password: password.result,
    port: dbPort,
    multiAz: multiAz,
    dbSubnetGroupName: subnetGroup.name,
    vpcSecurityGroupIds: [sg.id],
    skipFinalSnapshot: false,
    finalSnapshotIdentifier: pulumi.interpolate`${dbName}-final-${pulumi.getStack()}`,
    publiclyAccessible: false,
    backupRetentionPeriod: 7,
    backupWindow: "03:00-04:00",
    maintenanceWindow: "sun:04:00-sun:05:00",
    storageEncrypted: true,
    deletionProtection: true,
  });

  outputs = {
    provider: pulumi.output("rds"),
    host: instance.address,
    port: pulumi.output(dbPort),
    db_name: pulumi.output(dbName),
    master_username: instance.username,
    master_password: pulumi.secret(password.result),
    connection_string: pulumi.secret(pulumi.interpolate`postgresql://${instance.username}:***@${instance.address}:${dbPort}/${dbName}`),
    arn: instance.arn,
    endpoint: pulumi.interpolate`${instance.address}:${dbPort}`,
  };
} else {
  const dockerImage = config.get("docker_image") ?? "postgres:16-alpine";
  const containerName = config.get("docker_container_name") ?? "pulumi-postgres-local";
  const hostPort = config.getNumber("host_port") ?? dbPort;

  const password = new random.RandomPassword("local-db-password", {
    length: 24,
    special: false,
  });

  const pgImage = new docker.RemoteImage("postgres-image", {
    name: dockerImage,
    keepLocally: true,
  });

  const pgContainer = new docker.Container("postgres-container", {
    image: pgImage.imageId,
    name: containerName,
    ports: [{
      internal: dbPort,
      external: hostPort,
    }],
    envs: [
      `POSTGRES_USER=${dbUser}`,
      `POSTGRES_PASSWORD=${password.result}`,
      `POSTGRES_DB=${dbName}`,
    ],
    restart: "always",
    networksAdvanced: [{
      name: "bridge",
    }],
  });

  outputs = {
    provider: pulumi.output("local"),
    host: pulumi.output("localhost"),
    port: pulumi.output(hostPort),
    db_name: pulumi.output(dbName),
    master_username: pulumi.output(dbUser),
    master_password: pulumi.secret(password.result),
    connection_string: pulumi.secret(pulumi.interpolate`postgresql://${dbUser}:***@localhost:${hostPort}/${dbName}?sslmode=disable`),
    arn: pulumi.output(""),
    endpoint: pulumi.interpolate`localhost:${hostPort}`,
  };
}

export const provider = outputs.provider;
export const host = outputs.host;
export const port = outputs.port;
export const db_name = outputs.db_name;
export const master_username = outputs.master_username;
export const master_password = outputs.master_password;
export const connection_string = outputs.connection_string;
export const arn = outputs.arn;
export const endpoint = outputs.endpoint;

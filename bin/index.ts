#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DemoCodeBuildWithGithubDeploymentStack } from '../lib/stack';

const app = new cdk.App();
new DemoCodeBuildWithGithubDeploymentStack(app, 'DemoCodeBuildWithGithubDeploymentStack');
app.synth()
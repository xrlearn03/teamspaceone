import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly config: ConfigService) {}

  @Get('apple-app-site-association')
  @Header('Content-Type', 'application/json')
  appleAppSiteAssociation() {
    const teamId = this.config.get<string>('APPLE_TEAM_ID') ?? '<APPLE_TEAM_ID>';
    const bundleId = 'com.edutapxr.teamspaceone.TeamspaceOne';
    return {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${teamId}.${bundleId}`,
            paths: [
              '/channel/*',
              '/channels/*',
              '/c/*',
              '/meeting/*',
              '/meetings/*',
              '/m/*',
              '/file/*',
              '/files/*',
              '/f/*',
            ],
          },
        ],
      },
    };
  }

  @Get('assetlinks.json')
  @Header('Content-Type', 'application/json')
  assetLinks() {
    const fingerprints = this.config.get<string>('ANDROID_CERT_FINGERPRINTS');
    const sha256CertFingerprints = fingerprints
      ? (JSON.parse(fingerprints) as string[])
      : ['<RELEASE_SHA256_FINGERPRINT>', '<DEBUG_SHA256_FINGERPRINT>'];
    return [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.teamspaceone.mobile',
          sha256_cert_fingerprints: sha256CertFingerprints,
        },
      },
    ];
  }
}

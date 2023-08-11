import { FSComponent, Subject } from '@microsoft/msfs-sdk';

export enum MfdSystem {
    None = '',
    Fms = 'fms',
    Atccom = 'atccom',
    Surv = 'surv',
    Fcubkup = 'fcubkup'
}

/*
 * Hierarchy of URIs: sys / category / page / extra
 */
export interface ActiveUriInformation {
    uri: string; // Full URI to MFD page, e.g. FMS/ACTIVE/INIT
    sys: MfdSystem; // 1st part of URI (system), can be fms, atccom, surv or fcubkup
    category: string; // 2nd part of URI, for FMS system for example ACTIVE, or SECx, or POSITION, or DATA
    page: string; // 3rd part of URI, e.g. for DATA it's AIRPORT, NAVAID, ...
    extra?: string; // Can be used for deep-linking within a page
}

/*
 * Handles navigation (and potentially other aspects) for MFD pages
 */
export class MfdUIService {
    public readonly activeUri = Subject.create<ActiveUriInformation>({
        uri: '',
        sys: MfdSystem.None,
        category: '',
        page: '',
        extra: '',
    });

    private navigationStack: string[] = [];

    public parseUri(uri: string) : ActiveUriInformation {
        const uriParts = uri.split('/');
        return {
            uri,
            sys: uriParts[0] as MfdSystem,
            category: uriParts[1],
            page: uriParts[2],
            extra: uriParts.slice(3).join('/'),
        };
    }

    /**
     * Navigate to MFD page.
     * @param uri The URI to navigate to. Format: sys/category/page, e.g. fms/active/init represents ACTIVE/INIT page from the FMS. Use URI 'back' for returning to previous page.
     * In theory, one can use anything after a third slash for intra-page deep linking: fms/active/perf/appr could link to the approach PERF page.
     */
    public navigateTo(uri: string) {
        let nextUri: string;

        if (uri === this.activeUri.get().uri) {
            // Same URL, don't navigate
            console.info('Navigate to same URL, ignored.');
            return;
        }

        if (uri === 'back') {
            if (this.navigationStack.length === 0) {
                return;
            }
            console.info('Navigate back');
            this.navigationStack.pop();
            nextUri = this.navigationStack[this.navigationStack.length - 1];
        } else {
            console.info(`Navigate to ${uri}`);
            this.navigationStack.push(uri);
            nextUri = uri;
        }

        const parsedUri = this.parseUri(nextUri);
        this.activeUri.set(parsedUri);
    }

    /*
     * Whether one can navigate back
     */
    public canGoBack() {
        return this.navigationStack.length > 1;
    }
}
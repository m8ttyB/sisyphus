#!/bin/bash
# -*- Mode: Shell-script; tab-width: 4; indent-tabs-mode: nil; -*-
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

export MOZ_CVS_FLAGS="-z3 -q"
export MOZILLA_OFFICIAL=1

if [[ -z "$CVSROOT" ]]; then
    if grep -q buildbot@qm ~/.ssh/id_dsa.pub; then
        export CVSROOT=:ext:unittest@cvs.mozilla.org:/cvsroot
        export CVS_RSH=ssh
    else
        export CVSROOT=:pserver:anonymous@cvs-mirror.mozilla.org:/cvsroot
    fi
fi

#
# options processing
#
options="p:b:T:e:c:X:"
usage()
{
    cat <<EOF

usage: set-build-env.sh -p product -b branch -T buildtype [-e extra]

-p product      one of js, firefox, fennec.
-b branch       one of supported branches. see library.sh
-T buildtype    one of opt debug
-e extra        extra qualifier to pick mozconfig and tree
-X processortype processor type: intel32, intel64, amd32, amd64, ppc
-c commands     quoted text string containing options commands to be
                executed using the build environment's shell.
EOF
}

myexit()
{
    myexit_status=$1

    case $0 in
        *bash*)
            # prevent "sourced" script calls from
            # exiting the current shell.
            break 99;;
        *)
            exit $myexit_status;;
    esac
}

for step in step1; do # dummy loop for handling exits

    unset product branch buildtype extra

    while getopts $options optname ;
      do
      case $optname in
          p) product=$OPTARG;;
          b) branch=$OPTARG;;
          T) buildtype=$OPTARG;;
          e) extra="-$OPTARG";;
          c) commands="$OPTARG";;
          X) processortype="$OPTARG";;
      esac
    done

    if [[ -n "$processortype" ]]; then
        export TEST_PROCESSORTYPE="$processortype"
    fi

    if [[ -z "$LIBRARYSH" ]]; then
        source $TEST_DIR/bin/library.sh
    fi

    # include environment variables
    datafiles=$TEST_DIR/data/$product,$branch$extra,$buildtype.data
    if [[ -e "$datafiles" ]]; then
        loaddata $datafiles
    fi

    # echo product=$product, branch=$branch, buildtype=$buildtype, extra=$extra

    if [[ -z "$product" || -z "$branch" || -z "$buildtype" ]]; then
        echo -n "missing"
        if [[ -z "$product" ]]; then
            echo -n " -p product"
        fi
        if [[ -z "$branch" ]]; then
            echo -n " -b branch"
        fi
        if [[ -z "$buildtype" ]]; then
            echo -n " -T buildtype"
        fi
        usage
        myexit $ERR_ARGS
    fi

    if [[ $branch == "release" ]]; then
        TEST_MOZILLA_HG=${TEST_MOZILLA_HG:-http://hg.mozilla.org/releases/mozilla-release}
        export BRANCH_CO_FLAGS="";
    elif [[ $branch == "beta" ]]; then
        TEST_MOZILLA_HG=${TEST_MOZILLA_HG:-http://hg.mozilla.org/releases/mozilla-beta}
        export BRANCH_CO_FLAGS="";
    elif [[ $branch == "aurora" ]]; then
        TEST_MOZILLA_HG=${TEST_MOZILLA_HG:-http://hg.mozilla.org/releases/mozilla-aurora}
        export BRANCH_CO_FLAGS="";
    elif [[ $branch == "nightly" ]]; then
        TEST_MOZILLA_HG=${TEST_MOZILLA_HG:-http://hg.mozilla.org/mozilla-central}
        export BRANCH_CO_FLAGS="";
    elif [[ $branch == "inbound" ]]; then
        TEST_MOZILLA_HG=${TEST_MOZILLA_HG:-http://hg.mozilla.org/integration/mozilla-inbound}
        export BRANCH_CO_FLAGS="";
    elif [[ $branch == "fx-team" ]]; then
        TEST_MOZILLA_HG=${TEST_MOZILLA_HG:-http://hg.mozilla.org/integration/fx-team}
        export BRANCH_CO_FLAGS="";
    else
        echo "Unknown branch: $branch"
        myexit $ERR_ARGS
    fi

    if [[ -n "$MOZ_CO_DATE" ]]; then
        export DATE_CO_FLAGS="--date \"<$MOZ_CO_DATE\""
    fi

    # here project refers to either browser or mail
    # and is used to find mozilla/(browser|mail)/config/mozconfig
    if [[ $product == "firefox" ]]; then
        export project=browser
        export MOZCONFIG=${MOZCONFIG:-"$TEST_DIR/mozconfig/$branch$extra/mozconfig-firefox-$OSID-$TEST_PROCESSORTYPE-$buildtype"}

    else
        echo "Assuming project=browser for product: $product"
        export project=browser
        export MOZCONFIG=${MOZCONFIG:-"$TEST_DIR/mozconfig/$branch$extra/mozconfig-${product}-$OSID-$TEST_PROCESSORTYPE-$buildtype"}
    fi

    if [[ ! -e "$MOZCONFIG" ]]; then
        error "mozconfig $MOZCONFIG does not exist"
    fi
    echo "mozconfig: $MOZCONFIG"
    cat $MOZCONFIG | sed 's/^/mozconfig: /'

    case $OSID in
        nt)
            # On Windows, Sisyphus is run under Cygwin, so the OS will be CYGWIN
            # regardless. Check if mozilla-build has been installed to the default
            # location, and if so, set up to call mozilla-build to perform the actual
            # build steps.
            #
            # To make life simpler:
            #
            # put the /mozilla directory directly under the cygwin
            # root and add a line to msys's /etc/fstab file to point msys's
            # path /mozilla to c:\cygwin\mozilla:
            #
            # c:/cygwin/mozilla /mozilla
            #
            # We can also change the mount point of the C: drive in cygwin from
            # /cygdrive/c to /c via mount -c /
            #
            # This will make all paths relative to the c: drive the same in cygwin and msys
            # while also making the path to the mozilla directory identical. This also
            # alleviates the need for a symbolic link in cygwin from /mozilla to /c/mozilla.
            #
            # It is also necessary to set the /tmp path in cygwin and msys to point to the
            # same physical directory.
            #
            # Note that all commands *except* make client.mk will be performed in cygwin.
            #
            # Note that when calling a command string of the form $buildbash --login -c "command",
            # you must cd to the desired directory as part of "command" since msys will set the
            # directory to the home directory prior to executing the command.

            export mozillabuild=${mozillabuild:-/c/mozilla-build}
            export BUILDDIR=${BUILDDIR:-/c/mozilla/builds}

            source $TEST_DIR/bin/set-msvc-env.sh

            echo moztools Location: $MOZ_TOOLS

            # now convert paths to cross compatible paths using
            # the common cygdrive prefix for cygwin and msys
            MOZCONFIG_WIN=`cygpath -w $MOZCONFIG`
            TEST_DIR_WIN=`cygpath -w $TEST_DIR`
            BUILDDIR_WIN=`cygpath -w $BUILDDIR`
            export MOZCONFIG=`cygpath -u $MOZCONFIG_WIN`
            export TEST_DIR=`cygpath -u $TEST_DIR_WIN`
            export BUILDDIR=`cygpath -u $BUILDDIR_WIN`
            ;;

        linux)
            export BUILDDIR=${BUILDDIR:-/mozilla/builds}
            ;;

        darwin)
            export BUILDDIR=${BUILDDIR:-/mozilla/builds}
            ;;
        *)
            ;;
    esac

    export BUILDTREE="${BUILDTREE:-$BUILDDIR/$branch$extra}"

    export MAKE=make

    case $OSID in
        nt)
            # Set MAKE to mozmake if it is available, otherwise
            # set it to pymake.
            if [[ -e /c/mozilla-build/mozmake/mozmake.exe ]]; then
                export MAKE=mozmake
            else
                export MAKE=${BUILDTREE}/mozilla/build/pymake/make.py
            fi
            # work around exe files not marked as executable.
            if ! chmod +x $BUILDTREE/mozilla/toolkit/crashreporter/tools/win32/*.exe > /dev/null 2>&1; then
                true # ignore when tree not yet checked out
            fi
            ;;
    esac

    #
    # extras can't be placed in mozconfigs since not all parts
    # of the build system use mozconfig (e.g. js shell) and since
    # the obj directory is not configurable for them as well thus
    # requiring separate source trees
    #

    case "$extra" in
        -too-much-gc)
            export XCFLAGS="-DWAY_TOO_MUCH_GC=1"
            export CFLAGS="-DWAY_TOO_MUCH_GC=1"
            export CXXFLAGS="-DWAY_TOO_MUCH_GC=1"
            ;;
        -jprof)
            ;;
        -narcissus)
            export XCFLAGS="-DNARCISSUS=1"
            export CFLAGS="-DNARCISSUS=1"
            export CXXFLAGS="-DNARCISSUS=1"
            ;;
    esac

    if [[ ! -d $BUILDTREE ]]; then
        echo "Build directory $BUILDTREE does not exist"
        myexit $ERR_ERROR
    fi

    if [[ -n "$TEST_MOZILLA_HG" ]]; then
        export TEST_MOZILLA_HG_REV=${TEST_MOZILLA_HG_REV:-default}
    fi

    # js shell builds
    if [[ $buildtype == "debug" ]]; then
        unset BUILD_OPT
    else
        export BUILD_OPT=1
    fi

    case "$OSID" in
        darwin)
            export JS_EDITLINE=1 # required for mac
            ;;
    esac
    # end js shell builds

    # set default "data" variables to reduce need for data files.

    case $product in
        firefox|fennec)
            export profilename=${profilename:-$product-$branch$extra-profile}
            export profiledirectory=${profiledirectory:-/tmp/$product-$branch$extra-profile}
            export userpreferences=${userpreferences:-$TEST_DIR/prefs/test-user.js}
            export extensiondir=${extensiondir:-$TEST_DIR/xpi}
            export executablepath=${executablepath:-$BUILDTREE/mozilla/$product-$buildtype/dist}
            ;;
        js)
            export jsshellsourcepath=${jsshellsourcepath:-$BUILDTREE/mozilla/js/src}
            ;;
    esac

    if [[ -n "$datafiles" && ! -e $datafiles ]]; then
        # if there is not already a data file for this configuration, create it
        # this will save this configuration for the tester.sh and other scripts
        # which use datafiles for passing configuration values.

        echo product=\${product:-$product}                                          >> $datafiles
        echo branch=\${branch:-$branch}                                             >> $datafiles
        echo buildtype=\${buildtype:-$buildtype}                                    >> $datafiles
        if [[ $product == "js" ]]; then
            echo jsshellsourcepath=\${jsshellsourcepath:-$jsshellsourcepath}        >> $datafiles
        else
            echo profilename=\${profilename:-$profilename}                          >> $datafiles
            echo profiledirectory=\${profiledirectory:-$profiledirectory}           >> $datafiles
            echo executablepath=\${executablepath:-$executablepath}                 >> $datafiles
            echo userpreferences=\${userpreferences:-$userpreferences}              >> $datafiles
            echo extensiondir=\${extensiondir:-$extensiondir}                       >> $datafiles
        fi
        if [[ -n "$TEST_MOZILLA_HG" ]]; then
            echo TEST_MOZILLA_HG=\${TEST_MOZILLA_HG:-$TEST_MOZILLA_HG}              >> $datafiles
            echo TEST_MOZILLA_HG_REV=\${TEST_MOZILLA_HG_REV:-$TEST_MOZILLA_HG_REV}  >> $datafiles
        fi
    fi

    if [[ -n "$commands" ]]; then
        if [[ -z "$cmdbat" ]]; then
            if  ! bash -c "cd $BUILDTREE/mozilla; $commands" 2>&1; then
                error "executing commands: $commands"
            fi
        else
            # Need to remove the traps set in library.sh since the called
            # functions will be removed here.
            trap INT
            trap ERR
            trap EXIT
            # msys+mozilla's configure barf on some of the functions exported
            # from the library.sh script in the subconfigure. Remove them from
            # the environment prior to calling the msys command.
            for f in $(set | grep -F ' ()' | sed 's| ()||'); do
                echo "unset $f"
                unset -f $f
            done
            unset SCRIPT
            commandstr="cmd /c $(cygpath -m $cmdbat) 'cd $BUILDTREE/mozilla; $commands'"
            echo "commandstr: $commandstr"
            if  ! bash --noprofile --login -i -c "$commandstr" 2>&1; then
                error "executing commands: $commands"
            fi
        fi
    fi

done
